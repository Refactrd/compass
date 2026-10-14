/**
 * A department's "workflow health bracket": a transparent, bottleneck-count
 * derived indicator, not a measured or sourced claim about the client's
 * operations. Brackets, not a raw number: an earlier version showed a bare
 * 0-100 score, which read as unclear on its own and could bottom out at a
 * literal "0" for a department with many bottlenecks, a genuinely bad look
 * in a document a real prospective client reads. A named bracket carries the
 * same "fewer bottlenecks is better" signal without presenting a number that
 * invites being read as precise, measured, or (at the low end) insulting.
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
  /** Internal only: drives bracket assignment and the Comprehensive
   * Report's engagement-wide average. Never shown to a consultant or a
   * client on its own; see bracketFor. */
  score: number;
  bottleneckCount: number;
};

export function computeWorkflowScore(bottleneckCount: number): WorkflowScore {
  return {
    score: Math.max(0, 100 - bottleneckCount * POINTS_PER_BOTTLENECK),
    bottleneckCount,
  };
}

export type WorkflowBracket = {
  grade: string;
  label: string;
  /** One sentence, written for a consultant or a client reading it cold,
   * not just a restatement of the grade letter. */
  description: string;
};

const BRACKETS: { min: number; bracket: WorkflowBracket }[] = [
  {
    min: 80,
    bracket: {
      grade: "A",
      label: "Strong",
      description: "Few bottlenecks identified; the workflow mostly runs as intended.",
    },
  },
  {
    min: 60,
    bracket: {
      grade: "B",
      label: "Workable",
      description: "A handful of bottlenecks, worth addressing but not urgent.",
    },
  },
  {
    min: 40,
    bracket: {
      grade: "C",
      label: "Needs attention",
      description: "Enough bottlenecks that they are likely costing real time.",
    },
  },
  {
    min: 20,
    bracket: {
      grade: "D",
      label: "Strained",
      description: "Bottlenecks are frequent enough to be a real drag on the workflow.",
    },
  },
  {
    min: 0,
    bracket: {
      grade: "F",
      label: "Critical",
      description: "Bottlenecks are dense enough that the workflow needs a rebuild, not a patch.",
    },
  },
];

/** Bracket for a department's own score. */
export function bracketFor(score: number): WorkflowBracket {
  return (BRACKETS.find((b) => score >= b.min) ?? BRACKETS[BRACKETS.length - 1]).bracket;
}

/** The Comprehensive Report's one engagement-wide bracket: the plain mean of
 * each department's own score, bracketed the same way. Not computed from a
 * pooled bottleneck count, since departments with different step counts are
 * not directly comparable that way; departments are first scored
 * individually, then the scores themselves are averaged. */
export function engagementBracket(scores: number[]): WorkflowBracket {
  if (scores.length === 0) return bracketFor(100);
  const mean = scores.reduce((total, score) => total + score, 0) / scores.length;
  return bracketFor(mean);
}
