import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * The single Anthropic entry point.
 *
 * CLAUDE.md, "Model-calling isolation": every model call in the app goes
 * through here rather than being scattered across route handlers, so a future
 * provider swap is one file instead of a repo-wide search. Nothing else should
 * import the SDK directly.
 *
 * Model choice is Claude Opus 5. It is the current default and the strongest at
 * the instruction-following this product depends on, since the whole point is a
 * reasoning discipline that is enforced rather than suggested. Cost is worth
 * naming: at 20 questions per consultant per day this is a small bill, but it
 * is not the cheapest option, and dropping to Sonnet is a one-line change here
 * if the spend turns out not to be worth it.
 */

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

/** Streaming, so a long answer cannot trip an HTTP timeout. */
const MAX_TOKENS = 32_000;

export class AiError extends Error {}
export class AiUnavailableError extends AiError {}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiError(
      "ANTHROPIC_API_KEY is not set. See the environment template in README.md.",
    );
  }
  client ??= new Anthropic();
  return client;
}

export type Turn = { role: "user" | "assistant"; content: string };

export type StreamEvent =
  | { type: "thinking" }
  | { type: "text"; text: string };

/**
 * Streams one assistant turn.
 *
 * Yields a `thinking` event when the model starts reasoning and `text` events
 * as prose arrives. The distinction is what will drive the real activity states
 * in the UI (week 2 day 5) rather than a decorative spinner: they have to be
 * tied to actual pipeline stages, so they are reported from the pipeline.
 */
export async function* streamAssistantTurn({
  system,
  messages,
  signal,
}: {
  system: string;
  messages: Turn[];
  signal?: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const anthropic = getClient();

  let stream;
  try {
    stream = anthropic.messages.stream(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages,
        // Adaptive thinking is the current mechanism; the fixed token budget
        // was removed on this model family. `summarized` display is what lets
        // the UI say "analyzing" truthfully instead of guessing.
        thinking: { type: "adaptive", display: "summarized" },
      },
      { signal },
    );
  } catch (error) {
    throw toAiError(error);
  }

  try {
    for await (const event of stream) {
      if (
        event.type === "content_block_start" &&
        event.content_block.type === "thinking"
      ) {
        yield { type: "thinking" };
      }

      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        }
      }
    }
  } catch (error) {
    throw toAiError(error);
  }
}

/**
 * Normalises SDK failures into two cases the UI actually distinguishes: the
 * provider being unreachable or overloaded, which is worth a retry, and
 * everything else, which is not.
 */
function toAiError(error: unknown): AiError {
  if (error instanceof Anthropic.APIError) {
    const retryable =
      error instanceof Anthropic.APIConnectionError ||
      error instanceof Anthropic.RateLimitError ||
      (typeof error.status === "number" && error.status >= 500);

    if (retryable) {
      return new AiUnavailableError(
        "Compass could not reach the AI provider. Your message is saved; try again in a moment.",
      );
    }
    return new AiError(`AI provider error ${error.status}: ${error.message}`);
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new AiError("Request cancelled.");
  }

  return new AiError(
    error instanceof Error ? error.message : "Unknown AI provider error.",
  );
}

/**
 * One structured-output call, returning the raw JSON text.
 *
 * Kept here rather than in the caller so the model-calling isolation rule still
 * holds: extraction is a second use of the provider, not a second provider.
 *
 * Runs at low effort. This is a mechanical read of a transcript against a fixed
 * schema, not a reasoning task, and effort is a tuning lever rather than a
 * model downgrade.
 */
export async function extractStructured({
  system,
  schema,
  prompt,
}: {
  system: string;
  schema: object;
  prompt: string;
}): Promise<string> {
  const anthropic = getClient();

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: {
        format: { type: "json_schema", schema },
        effort: "low",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const text = (response as { content: { type: string; text?: string }[] })
      .content.find((block) => block.type === "text")?.text;

    if (!text) throw new AiError("Structured call returned no text.");
    return text;
  } catch (error) {
    throw toAiError(error);
  }
}

export function assistantModel(): string {
  return MODEL;
}
