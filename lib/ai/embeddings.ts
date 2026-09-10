import "server-only";

/**
 * Single wrapper around the embedding provider.
 *
 * Same reasoning as lib/ai/client.ts for Anthropic (CLAUDE.md, "Model-calling
 * isolation"): every embedding call in the app goes through here, so swapping
 * providers is one file rather than a repo-wide search. Batching, pacing and
 * retries are implementation details of the provider and stay behind this door.
 *
 * Voyage, because Anthropic has no embeddings endpoint and Voyage is the
 * partner they recommend. Verified against the live API: voyage-3.5-lite,
 * voyage-3.5 and voyage-3-large all return 1024 dimensions with
 * output_dimension set, which is what document_chunks.embedding is declared as.
 *
 * Changing EMBEDDING_MODEL is safe. Changing EMBEDDING_DIMENSIONS is not: it
 * must match the vector(1024) column, and altering it means re-embedding every
 * chunk already stored.
 */

const ENDPOINT = "https://api.voyageai.com/v1/embeddings";

/** voyage-3.5 over -lite: at this document volume the cost difference is
 *  immaterial, and retrieval quality is what the grounding rules depend on. */
const MODEL = process.env.EMBEDDING_MODEL ?? "voyage-3.5";

export const EMBEDDING_DIMENSIONS = 1024;

/**
 * Token ceiling per request.
 *
 * Sized against the *worst* tier, not the current one. Voyage's free trial
 * allows 10K tokens per minute, and a naive batch of 96 chunks is around 27K
 * tokens, so it fails on the first call with a 429 whose message talks about
 * payment methods rather than size. Staying under 8K keeps a single request
 * viable even on the slowest tier; a paid tier simply gets through the batches
 * faster.
 */
const MAX_TOKENS_PER_REQUEST = Number(
  process.env.EMBEDDING_MAX_TOKENS_PER_REQUEST ?? 8000,
);

/** Voyage's own per-request input cap sits well above this. */
const MAX_INPUTS_PER_REQUEST = 64;

/** Rough char-to-token ratio. Deliberately pessimistic, so the estimate
 *  overshoots rather than undershooting into a 429. */
const CHARS_PER_TOKEN = 3.5;

const MAX_ATTEMPTS = 5;

/** Per-request ceiling. A large batch takes a couple of seconds; anything past
 *  this is a stalled connection, not slow work. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Voyage embeds documents and queries differently. Passing the wrong one
 *  costs retrieval accuracy silently, so it is a required argument. */
export type EmbeddingInputType = "document" | "query";

type VoyageResponse = {
  data: { embedding: number[]; index: number }[];
  usage?: { total_tokens?: number };
};

export class EmbeddingError extends Error {}

/** Raised when the provider is throttling and backoff did not clear it. */
export class EmbeddingRateLimitError extends EmbeddingError {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Splits inputs so no request exceeds either the token or the count ceiling. */
function batch(texts: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let tokens = 0;

  for (const text of texts) {
    const cost = estimateTokens(text);

    if (
      current.length > 0 &&
      (tokens + cost > MAX_TOKENS_PER_REQUEST ||
        current.length >= MAX_INPUTS_PER_REQUEST)
    ) {
      batches.push(current);
      current = [];
      tokens = 0;
    }

    current.push(text);
    tokens += cost;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

async function embedOnce(
  texts: string[],
  inputType: EmbeddingInputType,
  apiKey: string,
): Promise<number[][]> {
  let lastRateLimitDetail = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: texts,
          model: MODEL,
          input_type: inputType,
          output_dimension: EMBEDDING_DIMENSIONS,
        }),
        // Without an explicit timeout a stalled connection hangs the whole
        // request, which for ingestion means a silent wait rather than an error.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // A connect timeout or DNS blip throws rather than returning a response,
      // so it never reached the status checks below and killed the turn on the
      // first hiccup. Treated as retryable, like a 5xx.
      lastRateLimitDetail =
        error instanceof Error ? error.message : "network error";
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(Math.min(2 ** attempt * 1000, 20_000));
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      lastRateLimitDetail = (await response.text()).slice(0, 200);

      if (attempt === MAX_ATTEMPTS) break;

      // Honour Retry-After when the provider sends one, otherwise back off
      // exponentially. Voyage's limits are per minute, so the ceiling is
      // deliberately long enough to cross a window boundary.
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(2 ** attempt * 1000, 20_000);

      await sleep(waitMs);
      continue;
    }

    if (!response.ok) {
      // Surfaced verbatim into the admin UI. A wrong model name or an invalid
      // dimension should say so, not read as "ingestion failed".
      const detail = await response.text();
      throw new EmbeddingError(
        `Embedding provider returned ${response.status}: ${detail.slice(0, 300)}`,
      );
    }

    const json = (await response.json()) as VoyageResponse;

    // The API is documented to preserve order, but the index is authoritative
    // and a silent misalignment here would attach every answer to the wrong
    // source without ever looking broken.
    const ordered = new Array<number[]>(texts.length);
    for (const item of json.data) ordered[item.index] = item.embedding;

    const missing = ordered.findIndex((vector) => !vector);
    if (missing !== -1) {
      throw new EmbeddingError(
        `Embedding provider returned no vector for input ${missing}.`,
      );
    }

    const wrongSize = ordered.find(
      (vector) => vector.length !== EMBEDDING_DIMENSIONS,
    );
    if (wrongSize) {
      throw new EmbeddingError(
        `Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${wrongSize.length}. This will not fit document_chunks.embedding.`,
      );
    }

    return ordered;
  }

  throw new EmbeddingRateLimitError(
    `The embedding provider did not respond successfully after ${MAX_ATTEMPTS} attempts. ` +
      `If this mentions rate limits: Voyage's free tier allows 3 requests and 10,000 tokens per minute, ` +
      `and adding a payment method raises it. Last failure: ${lastRateLimitDetail}`,
  );
}

/**
 * Embeds any number of texts, batching and retrying as needed.
 *
 * Callers pass the whole set and get back one vector per input, in order.
 */
export async function embed(
  texts: string[],
  inputType: EmbeddingInputType,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.EMBEDDING_API_KEY;
  if (!apiKey) {
    throw new EmbeddingError(
      "EMBEDDING_API_KEY is not set. See the environment template in README.md.",
    );
  }

  const vectors: number[][] = [];
  for (const group of batch(texts)) {
    vectors.push(...(await embedOnce(group, inputType, apiKey)));
  }
  return vectors;
}

export function embeddingModel(): string {
  return MODEL;
}

/** Exported for the ingestion UI, so an admin can be told what to expect. */
export function estimateRequestCount(texts: string[]): number {
  return batch(texts).length;
}
