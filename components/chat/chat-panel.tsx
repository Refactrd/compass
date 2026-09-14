"use client";

import { ArrowUp, RotateCw, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AssistantMarkdown } from "@/components/chat/assistant-markdown";
import { ContextPanel } from "@/components/chat/context-panel";
import { MessageSources } from "@/components/chat/message-sources";
import { UsageCounter } from "@/components/chat/usage-counter";
import { WorkspaceHome } from "@/components/chat/workspace-home";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { decodeEvents } from "@/lib/chat/stream-protocol";
import type {
  ClientLinkSuggestion,
  ClientPanelRecord,
  UsageSnapshot,
} from "@/lib/chat/stream-protocol";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Source document titles. Undefined on stored messages until resolved. */
  sourceTitles?: string[];
};

type Stage = "retrieving" | "analyzing" | "preparing";

const STAGE_LABELS: Record<Stage, string> = {
  retrieving: "Looking through the knowledge base",
  analyzing: "Working through the reasoning chain",
  preparing: "Writing the answer",
};

/**
 * The conversation itself.
 *
 * Streams over newline-delimited JSON from /api/messages. The pending question
 * is rendered optimistically and, crucially, is left on screen if the turn
 * fails: the server has already persisted it, so it exists whether or not an
 * answer arrived, and retry resends it rather than asking the consultant to
 * retype.
 */
export function ChatPanel({
  conversationId,
  initialMessages,
  email,
  initialClient,
  initialSuggestion,
  initialUsage,
}: {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  email: string;
  initialClient: ClientPanelRecord | null;
  initialSuggestion: ClientLinkSuggestion | null;
  initialUsage: UsageSnapshot;
}) {
  const router = useRouter();
  const toast = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [stage, setStage] = useState<Stage | null>(null);
  const [sources, setSources] = useState<string[] | null>(null);
  const [failed, setFailed] = useState<{ retryable: boolean } | null>(null);
  const [input, setInput] = useState("");
  const [client, setClient] = useState<ClientPanelRecord | null>(initialClient);
  const [suggestion, setSuggestion] = useState<ClientLinkSuggestion | null>(initialSuggestion);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [activeConversationId, setActiveConversationId] = useState(conversationId);
  const [usage, setUsage] = useState<UsageSnapshot>(initialUsage);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // Mirrors `sources` so the completion handler reads the latest value rather
  // than the one captured when this turn started.
  const sourcesRef = useRef<string[] | null>(null);
  const streaming = pendingQuestion !== null;

  // Follows the stream. Deliberately not "scroll only if already at the bottom":
  // during a turn the consultant is reading the answer as it lands.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, answer, stage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(question: string) {
    setPendingQuestion(question);
    setAnswer("");
    setStage(null);
    setSources(null);
    setFollowUps([]);
    setFailed(null);

    const controller = new AbortController();
    abortRef.current = controller;

    let createdId: string | null = null;

    try {
      // activeConversationId, not the conversationId prop: the prop is fixed
      // for a "new conversation" page load, but the server assigns a real id
      // on the first attempt and sends it back as a "conversation" event
      // regardless of whether that attempt then succeeds or fails. Using the
      // prop here meant every retry after a failed first attempt created a
      // second, separate, orphaned conversation instead of continuing the one
      // that already existed.
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeConversationId, content: question }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => null);

        // A disabled account left mid-conversation: retrying would just 403
        // again forever, so this is a redirect, not a retryable failure. No
        // toast first — one is about to land on a screen that explains it.
        if (detail?.accessRevoked) {
          router.push("/access-revoked?reason=disabled");
          return;
        }

        if (detail?.rateLimited) {
          setUsage((current) => ({
            ...current,
            count: current.limit,
            remaining: 0,
            resetAt: detail.resetAt ?? current.resetAt,
          }));
        }
        throw new Error(detail?.error ?? "Compass could not send that message.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamed = "";
      let savedId: string | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = decodeEvents(buffer);
        buffer = rest;

        for (const event of events) {
          if (event.type === "conversation") {
            createdId = event.id;
            setActiveConversationId(event.id);
          }
          if (event.type === "stage") setStage(event.stage);
          if (event.type === "sources") {
            sourcesRef.current = event.titles;
            setSources(event.titles);
          }
          if (event.type === "text") {
            streamed += event.text;
            setAnswer(streamed);
          }
          if (event.type === "client") setClient(event.client);
          if (event.type === "suggestion") setSuggestion(event.suggestion);
          if (event.type === "followUps") setFollowUps(event.questions);
          if (event.type === "usage") setUsage(event.usage);
          if (event.type === "done") savedId = event.messageId;
          if (event.type === "error") {
            setFailed({ retryable: event.retryable });
            setStage(null);
            toast("error", event.message);
            return;
          }
        }
      }

      if (savedId) {
        setMessages((current) => [
          ...current,
          { id: `local-${savedId}-q`, role: "user", content: question },
          {
            id: savedId,
            role: "assistant",
            content: streamed,
            sourceTitles: sourcesRef.current ?? [],
          },
        ]);
        setPendingQuestion(null);
        setAnswer("");
        setStage(null);

        // A brand new conversation gets its own URL, so a refresh or a sidebar
        // click lands back on the same thread.
        if (createdId) router.replace(`/c/${createdId}`);
        else router.refresh();
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setPendingQuestion(null);
        setStage(null);
        return;
      }
      setFailed({ retryable: true });
      setStage(null);
      toast(
        "error",
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      abortRef.current = null;
    }
  }

  const atLimit = usage.remaining <= 0;

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || streaming || atLimit) return;
    setInput("");
    void send(question);
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div
          className={cn(
            "mx-auto w-full max-w-3xl px-6",
            // An empty conversation centres in the space rather than hugging
            // the top and leaving a gap above the composer.
            messages.length === 0 && !streaming
              ? "flex min-h-full items-center py-6"
              : "py-8",
          )}
        >
          {messages.length === 0 && !streaming ? (
            <WorkspaceHome
              className="w-full"
              email={email}
              onPick={(prompt) => {
                setInput(prompt);
                composerRef.current?.focus();
              }}
            />
          ) : (
            <div className="flex flex-col gap-6">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}

              {pendingQuestion !== null ? (
                <>
                  <MessageBubble
                    message={{
                      id: "pending",
                      role: "user",
                      content: pendingQuestion,
                    }}
                  />
                  {answer ? (
                    <MessageBubble
                      message={{
                        id: "streaming",
                        role: "assistant",
                        content: answer,
                      }}
                      streaming
                      sources={sources ?? undefined}
                    />
                  ) : null}
                  {stage && !answer ? <StageIndicator stage={stage} /> : null}
                  {failed ? (
                    <FailedTurn
                      retryable={failed.retryable}
                      onRetry={() => void send(pendingQuestion)}
                      onDismiss={() => {
                        setFailed(null);
                        setPendingQuestion(null);
                        router.refresh();
                      }}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-canvas">
        {followUps.length > 0 && !streaming ? (
          <div className="mx-auto flex w-full max-w-3xl flex-wrap gap-2 px-6 pt-3">
            {followUps.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => {
                  setFollowUps([]);
                  void send(question);
                }}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-brass/40 hover:bg-brass-tint hover:text-ink"
              >
                {question}
              </button>
            ))}
          </div>
        ) : null}

        <form
          onSubmit={onSubmit}
          className="mx-auto w-full max-w-3xl px-6 py-4"
        >
          <div className="flex items-end gap-2 rounded-xl border border-border-strong bg-surface p-2 focus-within:border-brass">
            <textarea
              ref={composerRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSubmit(event);
                }
              }}
              disabled={atLimit}
              rows={1}
              placeholder={
                atLimit
                  ? "Daily limit reached. Come back after the reset."
                  : "Describe the client situation, at whatever level of detail you have."
              }
              aria-label="Message"
              className="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink placeholder:text-slate-light focus:outline-none disabled:cursor-not-allowed disabled:text-slate-light"
            />
            {streaming ? (
              <Button
                type="button"
                variant="secondary"
                className="px-2.5 py-2"
                onClick={() => abortRef.current?.abort()}
                aria-label="Stop generating"
              >
                <Square className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="submit"
                className="px-2.5 py-2"
                disabled={!input.trim() || atLimit}
                aria-label="Send"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
          <UsageCounter
            count={usage.count}
            limit={usage.limit}
            resetAt={usage.resetAt}
          />
          {!atLimit ? (
            <p className="mt-1 text-center text-xs text-slate-light">
              Compass follows Refactrd&rsquo;s reasoning chain. It will ask
              before it recommends.
            </p>
          ) : null}
        </form>
      </div>
      </div>

      {/* Collapsible on the right, as the design calls for. Hidden below xl
          rather than stacked: on a narrow screen the conversation is the thing
          that matters, and the panel is a correction surface. */}
      <aside className="hidden w-72 shrink-0 border-l border-border xl:block">
        <ContextPanel
          client={client}
          suggestion={suggestion}
          conversationId={activeConversationId}
          onClientChange={(next) => {
            setClient(next);
            // Resolving the suggestion is what dismisses it. There is no
            // "remind me later" state to persist, because either answer links
            // the conversation to a client and the question stops being open.
            setSuggestion(null);
          }}
        />
      </aside>
    </div>
  );
}

function MessageBubble({
  message,
  streaming = false,
  sources,
}: {
  message: ChatMessage;
  streaming?: boolean;
  sources?: string[];
}) {
  const isUser = message.role === "user";
  const shown = sources ?? message.sourceTitles;

  return (
    <div className={cn("flex", isUser ? "justify-end pt-2" : "justify-start")}>
      <div
        className={cn(
          "min-w-0",
          // The question is a bubble; the answer is not. Boxing the answer made
          // long prose read as a chat log, and squeezed tables into an
          // unreadable width. Unboxed, it reads as the document it is.
          isUser
            ? "max-w-[85%] rounded-2xl bg-brass-tint px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-ink"
            : "w-full text-ink",
        )}
      >
        {/* User text is shown verbatim: an underscore they typed meant an
            underscore, not emphasis. */}
        {isUser ? (
          message.content
        ) : (
          <AssistantMarkdown content={message.content} />
        )}
        {streaming ? (
          <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-brass" />
        ) : null}
        {/* Only once the answer is complete: attribution under a half-written
            answer invites reading it as final. */}
        {!isUser && !streaming && shown ? (
          <MessageSources titles={shown} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Reports the pipeline stage the server says it is actually at. Not a timer,
 * not a fixed sequence: each label is sent when that step really begins.
 */
function StageIndicator({ stage }: { stage: Stage }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-slate">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
      {STAGE_LABELS[stage]}
    </div>
  );
}

function FailedTurn({
  retryable,
  onRetry,
  onDismiss,
}: {
  retryable: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-xl border border-danger/30 bg-danger-tint p-4">
      <p className="text-sm leading-relaxed text-danger">
        {retryable
          ? "That turn did not complete. Your question is saved, so nothing is lost."
          : "That turn failed and retrying is unlikely to help."}
      </p>
      <div className="mt-3 flex gap-2">
        {retryable ? (
          <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={onRetry}>
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </Button>
        ) : null}
        <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
