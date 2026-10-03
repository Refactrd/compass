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
