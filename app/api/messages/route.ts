import { NextResponse, type NextRequest } from "next/server";

import { AiUnavailableError, streamAssistantTurn } from "@/lib/ai/client";
import { retrieve } from "@/lib/ai/retrieval";
import { syncClientContext } from "@/lib/chat/client-context";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { encodeEvent, type ChatStreamEvent } from "@/lib/chat/stream-protocol";
import { createClient } from "@/lib/supabase/server";

/**
 * One conversational turn: persist the question, stream the answer, persist it.
 *
 * Reads and writes through the RLS-scoped client rather than the service role,
 * so the row level security policies are the thing actually enforcing ownership
 * on the hot path, not just a backstop behind application checks.
 *
 * Not yet here, and deliberately: the daily rate limit check (week 3 day 1)
 * and client-context extraction (week 2 day 4).
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

        // Kicked off now, awaited after the stream. Extraction reads the
        // transcript, not the answer, so it does not need to wait for one, and
        // running it in parallel keeps it off the answer's critical path.
        const extraction = syncClientContext({
          supabase,
          conversationId,
          userId: user.id,
          turns,
        });

        let answer = "";
        let announcedPreparing = false;

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
            answer += event.text;
            send({ type: "text", text: event.text });
          }
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

        // Bumps the conversation so the sidebar orders by real activity.
        // Messages live in their own table, so nothing else would move this.
        // The value is overwritten by the updated_at trigger; the point is to
        // perform an update at all.
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);

        // Awaited rather than fired and forgotten: on a serverless host the
        // function can be torn down the moment the stream closes, which would
        // cancel it mid-write.
        const client = await extraction.catch((error) => {
          console.error("[messages] client extraction failed", error);
          return null;
        });
        send({ type: "client", client });

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
