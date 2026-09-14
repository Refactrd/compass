import { NextResponse, type NextRequest } from "next/server";

import { AiUnavailableError, streamAssistantTurn } from "@/lib/ai/client";
import { retrieve } from "@/lib/ai/retrieval";
import { syncClientContext } from "@/lib/chat/client-context";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { HouseStyleStream } from "@/lib/chat/house-style";
import { encodeEvent, type ChatStreamEvent } from "@/lib/chat/stream-protocol";
import { consumeUsage, getUsage } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * One conversational turn: persist the question, stream the answer, persist it.
 *
 * Reads and writes through the RLS-scoped client rather than the service role,
 * so the row level security policies are the thing actually enforcing ownership
 * on the hot path, not just a backstop behind application checks.
 *
 * The 20/day cap is checked before any writes: over the limit produces a
 * clean 429 with a reset time and touches nothing, which is what "no model
 * call made" means in CLAUDE.md's request lifecycle. The count itself only
 * moves on a successful turn (lib/rate-limit.ts's consumeUsage, called once
 * the answer is saved) — a provider outage or a save failure does not cost
 * the consultant part of their daily quota.
 */

/** How much history to replay. Long-thread summarisation is out of MVP scope. */
const HISTORY_LIMIT = 30;

const MAX_MESSAGE_CHARS = 8000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Status is read per request, so an account disabled mid-conversation cannot
  // send another message on an existing session.
  const { data: profile } = await supabase
    .from("users")
    .select("status")
    .eq("id", user.id)
    .single();
  if (!profile || profile.status !== "active") {
    return NextResponse.json({ error: "Access revoked." }, { status: 403 });
  }

  const usageBeforeTurn = await getUsage(supabase, user.id);
  if (usageBeforeTurn.remaining <= 0) {
    return NextResponse.json(
      {
        error: "Daily limit reached.",
        rateLimited: true,
        resetAt: usageBeforeTurn.resetAt,
      },
      { status: 429 },
    );
  }

  let body: { conversationId?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const content = (body.content ?? "").trim();
  if (!content) {
    return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  }
  if (content.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      { error: `Messages are limited to ${MAX_MESSAGE_CHARS} characters.` },
      { status: 400 },
    );
  }

  // Resolve or create the conversation before streaming, so a failure here is a
  // clean HTTP error rather than an error buried inside a 200 stream.
  let conversationId = body.conversationId ?? null;
  let createdConversation: { id: string; title: string } | null = null;

  if (conversationId) {
    // RLS makes this return nothing for someone else's conversation, so a
    // forged id is indistinguishable from a missing one, which is correct.
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }
  } else {
    const title = deriveTitle(content);
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title })
      .select("id, title")
      .single();

    if (error || !created) {
      return NextResponse.json(
        { error: "Could not start the conversation." },
        { status: 500 },
      );
    }
    conversationId = created.id;
    createdConversation = { id: created.id, title: created.title ?? title };
  }

  // Persisted before the model is called. If the provider is down, the question
  // is still in the transcript and can be retried, which is the behaviour the
  // "AI provider unavailable" error state requires.
  const { error: userMessageError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content,
  });
  if (userMessageError) {
    return NextResponse.json(
      { error: "Could not save your message." },
      { status: 500 },
    );
  }

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);

  const turns = (history ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) =>
        controller.enqueue(encoder.encode(encodeEvent(event)));

      try {
        if (createdConversation) {
          send({ type: "conversation", ...createdConversation });
        }

        send({ type: "stage", stage: "retrieving" });
        // Retrieval runs against the question alone rather than the whole
        // thread: embedding the history would blur what is being asked now.
        const retrieval = await retrieve(supabase, content);

        // Sent even when empty, so the UI can say "unsourced" rather than
        // leaving the reader to assume sources are still loading.
        send({ type: "sources", titles: retrieval.titles });

        send({ type: "stage", stage: "analyzing" });

        // Whatever is already known about the client shapes this answer. The
        // extraction below updates it for the next one.
        const { data: linked } = await supabase
          .from("conversations")
          .select("client_id")
          .eq("id", conversationId)
          .maybeSingle();

        let clientContext = null;
        if (linked?.client_id) {
          const { data } = await supabase
            .from("clients")
            .select("name, industry, size, notes")
            .eq("id", linked.client_id)
            .maybeSingle();
          clientContext = data;
        }

        const system = buildSystemPrompt({
          retrieved: retrieval.chunks,
          client: clientContext,
        });

        let answer = "";
        let announcedPreparing = false;
        const houseStyle = new HouseStyleStream();

        for await (const event of streamAssistantTurn({
          system,
          messages: turns,
          signal: request.signal,
        })) {
          if (event.type === "text") {
            // The first token of prose is the honest moment to say the answer
            // is being written, rather than a timer pretending to know.
            if (!announcedPreparing) {
              announcedPreparing = true;
              send({ type: "stage", stage: "preparing" });
            }
            // Accumulated from the sanitised text, so what gets stored is
            // exactly what was displayed.
            const clean = houseStyle.push(event.text);
            if (clean) {
              answer += clean;
              send({ type: "text", text: clean });
            }
          }
        }

        const trailing = houseStyle.flush();
        if (trailing) {
          answer += trailing;
          send({ type: "text", text: trailing });
        }

        if (!answer.trim()) {
          send({
            type: "error",
            message: "The AI provider returned an empty response.",
            retryable: true,
          });
          controller.close();
          return;
        }

        const { data: saved, error: saveError } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            role: "assistant",
            content: answer,
            // Null rather than an empty array when nothing was retrieved, so
            // "unsourced" and "not recorded" stay distinguishable later.
            source_chunk_ids:
              retrieval.chunkIds.length > 0 ? retrieval.chunkIds : null,
          })
          .select("id")
          .single();

        if (saveError || !saved) {
          // Same reasoning as the retrieval logger: a save failure is invisible
          // from the client, and the message it produces says nothing about why.
          console.error("[messages] assistant insert failed", saveError);
          send({
            type: "error",
            message:
              "The answer was generated but could not be saved. Copy anything you need before leaving this page.",
            retryable: false,
          });
          controller.close();
          return;
        }

        // Counted now that there is a saved answer to show for it. A provider
        // failure or a save failure returns above this line, so neither costs
        // part of the daily quota.
        const usage = await consumeUsage(user.id).catch((error) => {
          console.error("[messages] usage increment failed", error);
          return null;
        });
        if (usage) send({ type: "usage", usage });

        // Bumps the conversation so the sidebar orders by real activity.
        // Messages live in their own table, so nothing else would move this.
        // The value is overwritten by the updated_at trigger; the point is to
        // perform an update at all.
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);

        // Runs after the answer rather than alongside it, because the
        // follow-up suggestions need to see what was just said. The answer is
        // already fully on screen by now, so this costs no perceived latency,
        // and it is awaited rather than fired and forgotten: a serverless host
        // can tear the function down the moment the stream closes.
        const context = await syncClientContext({
          supabase,
          conversationId,
          userId: user.id,
          turns: [...turns, { role: "assistant" as const, content: answer }],
        }).catch((error) => {
          console.error("[messages] client extraction failed", error);
          return { client: null, suggestion: null, followUps: [] };
        });

        send({ type: "client", client: context.client });
        send({ type: "suggestion", suggestion: context.suggestion });
        send({ type: "followUps", questions: context.followUps });

        send({ type: "done", messageId: saved.id });
        controller.close();
      } catch (error) {
        send({
          type: "error",
          message:
            error instanceof Error ? error.message : "Something went wrong.",
          retryable: error instanceof AiUnavailableError,
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      // Without this a proxy may buffer the whole response and defeat streaming.
      "X-Accel-Buffering": "no",
    },
  });
}

/** First line of the question, trimmed to something that fits a sidebar row. */
function deriveTitle(content: string): string {
  const firstLine = content.split("\n").find((line) => line.trim()) ?? content;
  const clean = firstLine.trim().replace(/\s+/g, " ");
  return clean.length <= 60 ? clean : `${clean.slice(0, 57).trimEnd()}...`;
}
