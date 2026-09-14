import "server-only";

import { extractStructured } from "@/lib/ai/client";
import { applyHouseStyle } from "@/lib/chat/house-style";

/**
 * Client-context extraction.
 *
 * CLAUDE.md is explicit that context capture is conversational, not a form: a
 * consultant describes a situation and the client facts are pulled out of it,
 * with the panel as the correction surface rather than the input method.
 *
 * This is a second model call per turn, which sits slightly against the "single
 * model call per turn" line in CLAUDE.md. That line is about not building a
 * multi-layer orchestration over the *answer*, and docs/system-design.md section
 * 6 asks for this pass by name ("after each user message, a structured-output
 * pass diffs new facts against the existing Client record"). It runs alongside
 * generation rather than in front of it, so it adds no latency to the answer.
 *
 * Extraction is deliberately conservative. A wrong client record is worse than
 * an empty one: it silently feeds the next turn's context, and the consultant
 * has no reason to go looking for a field they never filled in.
 */

const EXTRACTION_SYSTEM = `
You read a consulting conversation and do two things: pull out what is known
about the client organization, and suggest what the consultant might usefully
ask next. You are populating a record, not writing prose.

Rules:

Only record what the consultant actually said or clearly implied about this
specific organization. Never infer from the industry what a typical company of
that kind would look like.

Use null for anything not established. Null is the correct answer far more often
than a guess. A field you are unsure about is a field that should stay null.

The organization is the consultant's client, not Refactrd and not the
consultant's own firm. If the conversation is about methodology in general, or
about no particular organization, every field is null.

Write every field without em dashes or en dashes. Use commas or full stops
instead. Ordinary hyphens in compound words are fine. These fields are shown to
the consultant in the context panel, so they follow the same house style as
everything else.

name: the organization's name as the consultant writes it. Null if they have
only described it generically, such as "a regional insurer".

industry: a short sector description, a few words at most.

size: whatever measure of scale was given, in the consultant's own terms, such
as "about 400 staff" or "12 branches". Null if never mentioned.

notes: the engagement situation in two or three sentences. What the client
believes the problem is, what has been observed, what has been measured. Facts
from the conversation only. No recommendations and no analysis of your own.

You will be shown any existing record. Carry forward anything still true, revise
what the conversation has corrected, and add what is new. Do not drop a field
that was previously established just because this turn did not mention it.

followUps: two or three questions the consultant might ask next, written in
their voice, as they would type them. Each should move the reasoning chain
forward from where the conversation actually is, not restate what was just
covered. Under twelve words each. If the last answer asked the consultant a
question, do not suggest asking it back. Return an empty array when nothing
useful suggests itself; a weak suggestion is worse than none.
`.trim();

const SCHEMA = {
  type: "object",
  properties: {
    name: { type: ["string", "null"] },
    industry: { type: ["string", "null"] },
    size: { type: ["string", "null"] },
    notes: { type: ["string", "null"] },
    // No maxItems: the structured-output schema rejects it on arrays. The cap
    // is applied in normalizeFollowUps instead, where the prompt's "two or
    // three" is the real constraint anyway.
    followUps: { type: "array", items: { type: "string" } },
  },
  required: ["name", "industry", "size", "notes", "followUps"],
  additionalProperties: false,
} as const;

export type ExtractedClient = {
  name: string | null;
  industry: string | null;
  size: string | null;
  notes: string | null;
};

export type ExistingClient = ExtractedClient;

export type ExtractionResult = {
  client: ExtractedClient | null;
  followUps: string[];
};

/** How much of the thread to read. The last few turns carry the client facts. */
const TRANSCRIPT_TURNS = 8;

export async function extractClientContext({
  turns,
  existing,
}: {
  turns: { role: "user" | "assistant"; content: string }[];
  existing: ExistingClient | null;
}): Promise<ExtractionResult> {
  const recent = turns.slice(-TRANSCRIPT_TURNS);
  if (recent.length === 0) return { client: null, followUps: [] };

  const transcript = recent
    .map(
      (turn) =>
        `<turn speaker="${turn.role === "user" ? "consultant" : "compass"}">\n${turn.content}\n</turn>`,
    )
    .join("\n\n");

  const existingBlock = existing
    ? `Existing record:\n${JSON.stringify(existing, null, 2)}`
    : "There is no existing record for this conversation yet.";

  try {
    const raw = await extractStructured({
      system: EXTRACTION_SYSTEM,
      schema: SCHEMA,
      prompt: `${existingBlock}\n\nConversation so far:\n\n${transcript}`,
    });

    const parsed = JSON.parse(raw) as ExtractedClient & {
      followUps?: unknown;
    };

    return {
      client: normalize(parsed),
      followUps: normalizeFollowUps(parsed.followUps),
    };
  } catch (error) {
    // Extraction is a side effect of the turn, never the point of it. A failure
    // here must not surface as a broken answer; the panel simply does not move
    // and no chips appear.
    //
    // Logged rather than swallowed. A silent catch here hid a rejected schema
    // for a full test cycle: the panel looked merely empty, which is also what
    // a conversation with no client in it looks like.
    console.error("[extraction] failed", error);
    return { client: null, followUps: [] };
  }
}

/** Trims, drops anything empty or absurdly long, and caps the count. */
function normalizeFollowUps(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => applyHouseStyle(item.trim().replace(/\s+/g, " ")))
    .filter((item) => item.length > 0 && item.length <= 120)
    .slice(0, 3);
}

/** Trims, collapses whitespace, and treats blank or evasive values as null. */
function normalize(value: ExtractedClient): ExtractedClient | null {
  const clean = (field: string | null | undefined): string | null => {
    if (typeof field !== "string") return null;
    const trimmed = field.trim().replace(/\s+/g, " ");
    if (!trimmed) return null;
    // Models occasionally answer the question rather than leaving the field
    // empty. These are not client names.
    if (/^(unknown|not (specified|stated|mentioned|given)|n\/?a|none)$/i.test(trimmed)) {
      return null;
    }
    // Backstop for the prompt rule, same as the answer stream.
    return applyHouseStyle(trimmed).slice(0, 2000);
  };

  const result: ExtractedClient = {
    name: clean(value?.name),
    industry: clean(value?.industry),
    size: clean(value?.size),
    notes: clean(value?.notes),
  };

  // Nothing worth recording. A record with no name is not yet a client.
  if (!result.name && !result.industry && !result.size && !result.notes) {
    return null;
  }

  return result;
}
