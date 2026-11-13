/**
 * A department's "Workflow health score": a transparent, bottleneck-count
 * derived indicator, not a measured or sourced claim about the client's
 * operations. Deliberately kept to something that can be explained in one
 * sentence ("100, minus 15 for each bottleneck identified") rather than a
 * opaque weighted model, because this number can end up in a document a real
 * prospective client reads (the department PDF, the Comprehensive Report),
 * and CLAUDE.md's grounding discipline for this phase is absolute: nothing
 * in this file should ever be mistaken for an estimated or measured figure
 * the way a solution's timeSavedEstimate is.
 *
 * Deliberately NOT attempting a "total time saved" aggregate across
 * departments or solutions: each solution's timeSavedEstimate (when one
 * exists at all) is free text pulled from whatever the transcript or
 * retrieved material actually supports ("roughly 40 minutes per truck",
 * "a meaningful reduction"), not a normalized number, and summing
 * incompatible free-text estimates into one headline figure would fabricate
 * a precision nothing here actually has. The roadmap already surfaces each
 * grounded estimate individually (lib/immersion/roadmap.ts); this file does
 * not add a second, invented number on top of it.
 */

const POINTS_PER_BOTTLENECK = 15;

export type WorkflowScore = {
  score: number;
  bottleneckCount: number;
};

export function computeWorkflowScore(bottleneckCount: number): WorkflowScore {
  return {
    score: Math.max(0, 100 - bottleneckCount * POINTS_PER_BOTTLENECK),
    bottleneckCount,
  };
}

/** The Comprehensive Report's one engagement-wide number: the plain mean of
 * each department's own score, rounded. Not computed from a pooled
 * bottleneck count, since departments with different step counts are not
 * directly comparable that way, departments are first scored individually,
 * then the scores themselves are averaged. */
export function computeAverageScore(scores: number[]): number {
  if (scores.length === 0) return 100;
  return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
}

/** One word, so a score reads as something rather than a bare number out of
 * context, in the UI and in both PDFs alike. */
export function scoreLabel(score: number): string {
  if (score >= 85) return "Strong";
  if (score >= 60) return "Workable";
  if (score >= 35) return "Strained";
  return "Critical";
}

/**
 * Scale readiness: how well a workflow copes under the stress test (a key
 * person leaving, demand surging, records lost, a dependency failing). Same
 * one-sentence transparency as the health score: 100, minus 25 for each
 * scenario where the workflow breaks and 10 for each where it strains. The
 * scenarios themselves are grounded in the transcript; this only counts
 * them. Null when there are no scenarios to score, never a default number.
 */
const POINTS_PER_BREAK = 25;
const POINTS_PER_STRAIN = 10;

export function computeScaleReadiness(
  outcomes: ("breaks" | "strains" | "holds")[],
): number | null {
  if (outcomes.length === 0) return null;
  const penalty = outcomes.reduce(
    (total, outcome) =>
      total + (outcome === "breaks" ? POINTS_PER_BREAK : outcome === "strains" ? POINTS_PER_STRAIN : 0),
    0,
  );
  return Math.max(0, 100 - penalty);
}

export const SCALE_READINESS_RULE =
  "100, minus 25 for each stress scenario the workflow breaks under and 10 for each it strains under.";
