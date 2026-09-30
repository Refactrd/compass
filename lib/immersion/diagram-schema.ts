import { applyHouseStyle } from "@/lib/chat/house-style";

/**
 * The step-and-branch shape shared by both the "before" and "after" workflow
 * diagrams. CLAUDE.md, Phase 2 non-negotiable: this is a fixed template, not
 * a generic graph. Steps are an ordered, mostly-linear sequence; branches are
 * the exception, called out explicitly rather than modeled as a general
 * graph edge list, because that is what a real department interview actually
 * produces, close to linear with occasional decision points, not an
 * arbitrary DAG.
 *
 * No library, no auto-layout: components/immersion/workflow-diagram.tsx
 * renders this directly, steps top to bottom in array order, branches as
 * explicit labeled connectors. Position is never computed, only assigned by
 * array index, so there is nothing here for a layout algorithm to get wrong.
 */

export type WorkflowStep = {
  /** Stable id, "step-1", "step-2", ... assigned by extraction, not the model. */
  id: string;
  /** Short, imperative. "Sales rep logs the lead in the CRM." */
  label: string;
  /** Who performs it, in the transcript's own words. Null if never said. */
  actor: string | null;
  /** One or two sentences of extra detail. Null if the label says it all. */
  description: string | null;
};

export type WorkflowBranch = {
  fromStepId: string;
  /** The condition that sends the flow down this path, e.g. "If the client
   * already has a signed PO". */
  condition: string;
  toStepId: string;
};

export type WorkflowDiagram = {
  steps: WorkflowStep[];
  /** Deviations from the default steps[i] -> steps[i+1] sequence: a fork, a
   * skip, or a loop back. Empty for a fully linear workflow. */
  branches: WorkflowBranch[];
};

/** Anthropic structured-output schema. See lib/ai/extraction.ts for why this
 * shape (no maxItems on arrays, no free-form ids): the model is asked for
 * step *indices* on branches, never a string id it has to invent and reuse
 * consistently across two separate arrays in one response. Indices are
 * 1-based, matching the order the steps themselves are returned in. */
export const WORKFLOW_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          actor: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
        },
        required: ["label", "actor", "description"],
        additionalProperties: false,
      },
    },
    branches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fromStepIndex: { type: "integer" },
          condition: { type: "string" },
          toStepIndex: { type: "integer" },
        },
        required: ["fromStepIndex", "condition", "toStepIndex"],
        additionalProperties: false,
      },
    },
  },
  required: ["steps", "branches"],
  additionalProperties: false,
} as const;

export type RawWorkflowStep = {
  label: string;
  actor: string | null;
  description: string | null;
};

export type RawWorkflowBranch = {
  fromStepIndex: number;
  condition: string;
  toStepIndex: number;
};

export type RawWorkflowDiagram = {
  steps: RawWorkflowStep[];
  branches: RawWorkflowBranch[];
};

/**
 * Raw model output -> clean WorkflowDiagram. Shared by transcript-extraction
 * (transcript -> "before") and after-diagram (before + solutions -> "after"):
 * both produce this same raw shape from a WORKFLOW_EXTRACTION_SCHEMA call, and
 * both need the same defensive cleanup — dropping a step with no usable
 * label, dropping a branch whose index the model hallucinated out of range,
 * and stripping a leading "if" or a trailing "skip to step N" from a
 * condition despite the prompt asking it not to include either: the template
 * component composes the full "If <condition>, skip to step N." sentence
 * itself, so a condition that already contains either fragment doubles up.
 * Caught live: the leading "if" case during days 3-5's transcript
 * extraction, the trailing "skip to step N" case during days 6-8's after
 * diagram, whose system prompt did not originally restate the same bare
 * condition rule.
 */
export function normalizeWorkflow(parsed: RawWorkflowDiagram): WorkflowDiagram {
  const rawSteps: RawWorkflowStep[] = Array.isArray(parsed.steps) ? parsed.steps : [];

  const steps: WorkflowStep[] = rawSteps
    .map((step, index): WorkflowStep | null => {
      const label = cleanWorkflowText(step?.label, 200);
      if (!label) return null;
      return {
        id: `step-${index + 1}`,
        label,
        actor: cleanWorkflowText(step?.actor, 120),
        description: cleanWorkflowText(step?.description, 500),
      };
    })
    .filter((step): step is WorkflowStep => step !== null);

  const rawBranches: RawWorkflowBranch[] = Array.isArray(parsed.branches)
    ? parsed.branches
    : [];

  const branches: WorkflowBranch[] = rawBranches
    .map((branch): WorkflowBranch | null => {
      const condition =
        cleanWorkflowText(branch?.condition, 200)
          ?.replace(/^if\s+/i, "")
          // Global, not end-anchored: the after-diagram generator has been
          // observed including this fragment more than once in one
          // condition string, so a single trailing strip left one instance
          // embedded mid-sentence, and the template's own suffix still
          // doubled up with it.
          ?.replace(/,?\s*(and\s+)?(then\s+)?skip(s)?\s+to\s+step\s+\d+\.?/gi, "")
          ?.replace(/\s{2,}/g, " ")
          ?.trim()
          ?.replace(/,\s*$/, "") ?? null;
      const from = toWorkflowStepId(branch?.fromStepIndex, steps.length);
      const to = toWorkflowStepId(branch?.toStepIndex, steps.length);
      if (!condition || !from || !to || from === to) return null;
      return { fromStepId: from, condition, toStepId: to };
    })
    .filter((branch): branch is WorkflowBranch => branch !== null);

  return { steps, branches };
}

/** 1-based model index -> "step-N" id, or null if out of range (dropped
 * rather than crashing on a hallucinated index). */
export function toWorkflowStepId(index: unknown, stepCount: number): string | null {
  if (typeof index !== "number" || !Number.isInteger(index)) return null;
  if (index < 1 || index > stepCount) return null;
  return `step-${index}`;
}

/**
 * Truncates at a word boundary, never mid-word: a rationale that ends "...so
 * this is described as a ca" reads as broken in a document a real client
 * sees, caught live when a solution's rationale ran past the previous hard
 * character slice.
 */
export function cleanWorkflowText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  const clean = applyHouseStyle(trimmed);
  if (clean.length <= maxLength) return clean;
  const cut = clean.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
