import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { embed } from "@/lib/ai/embeddings";
import type { RetrievedChunk } from "@/lib/ai/system-prompt";
import type { Database } from "@/lib/types/database";

/**
 * Retrieval against the ingested Refactrd knowledge base.
 *
 * Two things worth stating plainly, because both are load-bearing:
 *
 * The query is embedded with input_type "query", not "document". Voyage embeds
 * the two asymmetrically, and using the wrong one costs accuracy silently:
 * nothing errors, results just get quietly worse.
 *
 * The similarity floor means empty retrieval is a normal outcome, not a
 * failure. A question the knowledge base has nothing to say about should
 * return nothing, so the grounding rules can say so honestly. Returning the
 * least-bad matches instead would produce confident citations of irrelevant
 * material, which is worse than no citation at all.
 */

const MATCH_COUNT = 8;

/**
 * Absolute similarity floor, measured against the real 265-chunk knowledge base
 * rather than guessed. voyage-3.5 with asymmetric query/document embedding
 * compresses cosine scores into a narrow band, so the numbers are lower and
 * closer together than they would be with a symmetric model:
 *
 *   clearly off-topic     best match 0.265 to 0.362
 *   on-topic              best match 0.397 to 0.633
 *
 * The usable gap is about 0.035 wide. 0.38 sits in it, but only just, which is
 * why the band below exists rather than relying on this number alone. An
 * earlier 0.40 excluded a perfectly reasonable question that scored 0.397; an
 * earlier 0.36 would have attached sources to a question about sourdough.
 *
 * Re-measure whenever the knowledge base changes shape, or if the embedding
 * model is ever swapped.
 */
const MIN_SIMILARITY = 0.38;

/**
 * Relative band below the best match.
 *
 * The absolute floor decides whether anything is relevant at all. This decides
 * how much company the best match keeps: with a strong top hit there is no
 * reason to also hand over chunks that only just cleared the floor, since
 * padding the context with marginal material is how a grounded answer starts
 * citing things it did not really use.
 */
const RELATIVE_BAND = 0.08;

export type RetrievalResult = {
  chunks: RetrievedChunk[];
  /** Chunk ids, written to messages.source_chunk_ids for attribution. */
  chunkIds: string[];
  /** Distinct source titles, in the order they first appear. */
  titles: string[];
};

export const EMPTY_RETRIEVAL: RetrievalResult = {
  chunks: [],
  chunkIds: [],
  titles: [],
};

type MatchRow = {
  id: string;
  document_id: string;
  document_title: string;
  content: string;
  similarity: number;
};

export async function retrieve(
  supabase: SupabaseClient<Database, "compass">,
  query: string,
): Promise<RetrievalResult> {
  const trimmed = query.trim();
  if (!trimmed) return EMPTY_RETRIEVAL;

  const [queryEmbedding] = await embed([trimmed], "query");
  if (!queryEmbedding) return EMPTY_RETRIEVAL;

  const { data, error } = await supabase.rpc("match_document_chunks", {
    // pgvector accepts the bracketed string form over PostgREST.
    query_embedding: `[${queryEmbedding.join(",")}]`,
    match_count: MATCH_COUNT,
    min_similarity: MIN_SIMILARITY,
  });

  // Retrieval failing should degrade to an unsourced answer rather than taking
  // the whole turn down. The grounding rules already handle having nothing.
  //
  // Logged rather than swallowed: an empty result and a broken result look
  // identical from the outside, and the difference matters when the knowledge
  // base appears to have stopped working.
  if (error) {
    console.error("[retrieval] match_document_chunks failed", error);
    return EMPTY_RETRIEVAL;
  }
  if (!data) return EMPTY_RETRIEVAL;

  const all = data as MatchRow[];
  if (all.length === 0) return EMPTY_RETRIEVAL;

  const best = all[0].similarity;
  const rows = all.filter((row) => row.similarity >= best - RELATIVE_BAND);

  return {
    chunks: rows.map((row) => ({
      documentTitle: row.document_title,
      content: row.content,
    })),
    chunkIds: rows.map((row) => row.id),
    titles: [...new Set(rows.map((row) => row.document_title))],
  };
}
