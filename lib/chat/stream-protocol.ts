/**
 * Wire format between the streaming route and the chat client.
 *
 * Newline-delimited JSON rather than SSE: both ends are ours, the browser is
 * reading it with a stream reader rather than EventSource, and one JSON object
 * per line is trivial to parse and to read in a network tab when something goes
 * wrong.
 */
export type ClientPanelRecord = {
  id: string;
  name: string;
  industry: string | null;
  size: string | null;
  notes: string | null;
};

export type UsageSnapshot = {
  count: number;
  limit: number;
  remaining: number;
  resetAt: string;
};

export type ClientLinkSuggestion = {
  proposed: {
    name: string;
    industry: string | null;
    size: string | null;
    notes: string | null;
  };
  existing: ClientPanelRecord;
  exact: boolean;
};

export type ChatStreamEvent =
  /** Sent first when the turn created a conversation, so the client can route. */
  | { type: "conversation"; id: string; title: string }
  /** Pipeline stage. Tied to real work, never decorative. */
  | { type: "stage"; stage: "retrieving" | "analyzing" | "preparing" }
  /** Source document titles behind this answer. Empty means unsourced. */
  | { type: "sources"; titles: string[] }
  | { type: "text"; text: string }
  /** Client record after this turn's extraction. Null means nothing recorded. */
  | { type: "client"; client: ClientPanelRecord | null }
  /** An organization that resembles an existing client, awaiting confirmation. */
  | { type: "suggestion"; suggestion: ClientLinkSuggestion | null }
  /** Clickable next questions. Empty when nothing useful suggested itself. */
  | { type: "followUps"; questions: string[] }
  /** Usage after this turn was counted. Drives the composer's live counter. */
  | { type: "usage"; usage: UsageSnapshot }
  | { type: "done"; messageId: string }
  /** `retryable` distinguishes a provider outage from a permanent failure. */
  | { type: "error"; message: string; retryable: boolean };

export function encodeEvent(event: ChatStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Splits a stream chunk into complete events, returning any trailing partial
 * line so the caller can prepend it to the next chunk. A JSON object split
 * across two network reads is normal, not exceptional.
 */
export function decodeEvents(buffer: string): {
  events: ChatStreamEvent[];
  rest: string;
} {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: ChatStreamEvent[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as ChatStreamEvent);
    } catch {
      // A malformed line means the stream is corrupt rather than merely
      // incomplete; skipping it is better than tearing down the whole turn.
    }
  }

  return { events, rest };
}
