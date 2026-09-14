/**
 * Fuzzy matching of a newly mentioned organization against existing clients.
 *
 * CLAUDE.md: "on a new company name mentioned in conversation, fuzzy-match
 * against existing Clients. If a plausible match is found, surface a one-click
 * confirm-to-link prompt in the context panel. Never auto-merge silently."
 *
 * Scored in JavaScript rather than with pg_trgm. Client records are one
 * consultancy's client list, so this is tens or low hundreds of rows, and
 * reading the names is cheaper than adding an extension and an index to
 * maintain. If that list ever reaches thousands, this is the thing to move
 * into Postgres.
 *
 * The threshold leans permissive on purpose. A false suggestion costs one
 * click to dismiss. A miss costs a duplicate client record that quietly splits
 * an engagement's history in two, and nobody notices until they go looking for
 * a conversation that is filed under the other spelling.
 */

const SUGGEST_THRESHOLD = 0.55;

/** Legal suffixes carry no distinguishing information for matching. */
const SUFFIXES =
  /\b(ltd|limited|inc|incorporated|llc|llp|plc|gmbh|bv|nv|sa|ag|pty|co|corp|corporation|company|group|holdings)\b/g;

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dice coefficient over character bigrams. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = (value: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < value.length - 1; i++) {
      const pair = value.slice(i, i + 2);
      out.set(pair, (out.get(pair) ?? 0) + 1);
    }
    return out;
  };

  const first = bigrams(a);
  const second = bigrams(b);
  let shared = 0;
  let total = 0;

  for (const count of first.values()) total += count;
  for (const [pair, count] of second) {
    total += count;
    const available = first.get(pair) ?? 0;
    if (available > 0) {
      shared += Math.min(available, count);
      first.set(pair, available - Math.min(available, count));
    }
  }

  return total === 0 ? 0 : (2 * shared) / total;
}

export type MatchCandidate = { id: string; name: string };

export type ClientMatch = {
  candidate: MatchCandidate;
  score: number;
  /** An exact match after normalisation, so linking is almost certainly right. */
  exact: boolean;
};

/**
 * The single best plausible match, or null.
 *
 * Returns one rather than a list: a panel asking "is this one of these four?"
 * is a decision, and the point of confirm-before-link is to make it a glance.
 */
export function findClientMatch(
  name: string,
  candidates: MatchCandidate[],
): ClientMatch | null {
  const target = normalizeName(name);
  if (!target) return null;

  let best: ClientMatch | null = null;

  for (const candidate of candidates) {
    const normalized = normalizeName(candidate.name);
    if (!normalized) continue;

    // A containment match catches "Northwind" against "Northwind Logistics",
    // which bigram overlap alone scores lower than it deserves.
    const contained =
      normalized.includes(target) || target.includes(normalized);

    const score = Math.max(
      similarity(target, normalized),
      contained ? 0.8 : 0,
    );

    if (score >= SUGGEST_THRESHOLD && (!best || score > best.score)) {
      best = {
        candidate,
        score,
        exact: normalized === target,
      };
    }
  }

  return best;
}
