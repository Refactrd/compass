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

/** How a workflow fares under a stress scenario (see bottleneck-extraction's
 * StressScenario): it stops working, it slows and strains, or it holds. */
export type StressOutcome = "breaks" | "strains" | "holds";

/** The transformed workflow's answer to one stress scenario. */
export type ScenarioResult = {
  scenarioId: string;
  outcome: StressOutcome;
  /** Which build or human checkpoint absorbs the shock, in one sentence. */
  how: string | null;
};

/** How a transformed stage is carried out. Only set on the "after" diagram. */
export type StageMode = "automated" | "people" | "unchanged";

/**
 * A named group of consecutive steps, the unit both diagrams are actually
 * drawn in (the SA Logistics findings report is the reference: 17 steps read
 * as eight stages a client recognises, not seventeen boxes). Stages are
 * always contiguous ranges of steps in order, so grouping never reorders
 * anything and the fixed template still never computes a position.
 */
export type WorkflowStage = {
  /** "stage-1", "stage-2", ... assigned by normalisation, not the model. */
  id: string;
  /** Two to four words. "Filter and route". */
  title: string;
  /** One short sentence (before) or two to three (after). */
  summary: string | null;
  stepIds: string[];
  /** After diagram only. */
  mode?: StageMode;
  /** After diagram only: who does the stage now, one or two words. "Assistant". */
  tag?: string | null;
  /** After diagram only: the manual work this stage replaces. */
  replaces?: string | null;
  /** After diagram only: titles of the proposed builds that power this stage. */
  builds?: string[];
  /** After diagram only: the critical decision a person still owns here,
   * the human in the loop. Null where the stage needs none. */
  humanCheckpoint?: string | null;
};

export type WorkflowDiagram = {
  steps: WorkflowStep[];
  /** Deviations from the default steps[i] -> steps[i+1] sequence: a fork, a
   * skip, or a loop back. Empty for a fully linear workflow. */
  branches: WorkflowBranch[];
  /** Optional: diagrams saved before stages existed have none, and stagesOf()
   * falls back to one stage per step for them. */
  stages?: WorkflowStage[];
  /** After diagram only: how the transformed workflow holds up under each
   * stress scenario from the "What we found" stress test. */
  resilience?: ScenarioResult[];
};

const STAGE_BASE_PROPERTIES = {
  title: { type: "string" },
  summary: { type: ["string", "null"] },
  startStepIndex: { type: "integer" },
  endStepIndex: { type: "integer" },
} as const;

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
    stages: {
      type: "array",
      items: {
        type: "object",
        properties: STAGE_BASE_PROPERTIES,
        required: ["title", "summary", "startStepIndex", "endStepIndex"],
        additionalProperties: false,
      },
    },
  },
  required: ["steps", "branches", "stages"],
  additionalProperties: false,
} as const;

/** Same shape plus the transformed-stage fields the "after" diagram needs. */
export const AFTER_WORKFLOW_SCHEMA = {
  ...WORKFLOW_EXTRACTION_SCHEMA,
  properties: {
    ...WORKFLOW_EXTRACTION_SCHEMA.properties,
    stages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ...STAGE_BASE_PROPERTIES,
          mode: { type: "string", enum: ["automated", "people", "unchanged"] },
          tag: { type: "string" },
          replaces: { type: ["string", "null"] },
          solutionIndexes: { type: "array", items: { type: "integer" } },
          humanCheckpoint: { type: ["string", "null"] },
        },
        required: [
          "title",
          "summary",
          "startStepIndex",
          "endStepIndex",
          "mode",
          "tag",
          "replaces",
          "solutionIndexes",
          "humanCheckpoint",
        ],
        additionalProperties: false,
      },
    },
    stressTests: {
      type: "array",
      items: {
        type: "object",
        properties: {
          scenarioIndex: { type: "integer" },
          outcome: { type: "string", enum: ["breaks", "strains", "holds"] },
          how: { type: ["string", "null"] },
        },
        required: ["scenarioIndex", "outcome", "how"],
        additionalProperties: false,
      },
    },
  },
  required: [...WORKFLOW_EXTRACTION_SCHEMA.required, "stressTests"],
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

export type RawWorkflowStage = {
  title: string;
  summary: string | null;
  startStepIndex: number;
  endStepIndex: number;
  mode?: string;
  tag?: string;
  replaces?: string | null;
  /** Resolved from solutionIndexes by the after-diagram generator before
   * normalisation, since only it knows the solution list. */
  builds?: string[];
  humanCheckpoint?: string | null;
};

export type RawWorkflowDiagram = {
  steps: RawWorkflowStep[];
  branches: RawWorkflowBranch[];
  stages?: RawWorkflowStage[];
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
      // 90 chars: short enough that a label fits the flowchart box
      // (components/immersion/workflow-diagram.tsx and the PDF's matching
      // template) in one or two lines without needing to shrink type or
      // grow the box. The extraction and revision prompts already ask for
      // one short sentence; this is the backstop for when they do not
      // comply, cutting at a word boundary rather than mid-word.
      const label = cleanWorkflowText(step?.label, 90);
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

  const stages = normalizeStages(parsed.stages, rawSteps.length, steps);

  return stages.length > 0 ? { steps, branches, stages } : { steps, branches };
}

/**
 * Only each stage's start index is trusted. Sorting by start and ending each
 * stage where the next begins always yields contiguous, non-overlapping
 * ranges that cover every step, whatever the model did with endStepIndex, so
 * a gap or overlap can never drop or duplicate a step on the diagram.
 */
function normalizeStages(
  rawStages: RawWorkflowStage[] | undefined,
  rawStepCount: number,
  steps: WorkflowStep[],
): WorkflowStage[] {
  if (!Array.isArray(rawStages) || steps.length === 0) return [];
  const existing = new Set(steps.map((step) => step.id));

  const starts = rawStages
    .map((stage) => ({ stage, start: stage?.startStepIndex }))
    .filter(
      (item): item is { stage: RawWorkflowStage; start: number } =>
        typeof item.start === "number" &&
        Number.isInteger(item.start) &&
        item.start >= 1 &&
        item.start <= rawStepCount &&
        !!cleanWorkflowText(item.stage?.title, 80),
    )
    .sort((a, b) => a.start - b.start)
    .filter((item, i, all) => i === 0 || item.start !== all[i - 1].start);

  if (starts.length === 0) return [];
  starts[0] = { ...starts[0], start: 1 };

  return starts
    .map(({ stage, start }, i): WorkflowStage | null => {
      const end = i + 1 < starts.length ? starts[i + 1].start - 1 : rawStepCount;
      const stepIds: string[] = [];
      for (let n = start; n <= end; n++) {
        if (existing.has(`step-${n}`)) stepIds.push(`step-${n}`);
      }
      if (stepIds.length === 0) return null;
      const mode =
        stage.mode === "automated" || stage.mode === "people" || stage.mode === "unchanged"
          ? stage.mode
          : undefined;
      return {
        id: `stage-${i + 1}`,
        title: cleanWorkflowText(stage.title, 80)!,
        summary: cleanWorkflowText(stage.summary, mode ? 450 : 220),
        stepIds,
        ...(mode
          ? {
              mode,
              tag: cleanWorkflowText(stage.tag, 30),
              replaces: cleanWorkflowText(stage.replaces, 220),
              builds: (Array.isArray(stage.builds) ? stage.builds : [])
                .map((title) => cleanWorkflowText(title, 150))
                .filter((title): title is string => !!title),
              humanCheckpoint: cleanWorkflowText(stage.humanCheckpoint, 220),
            }
          : {}),
      };
    })
    .filter((stage): stage is WorkflowStage => stage !== null)
    .map((stage, i) => ({ ...stage, id: `stage-${i + 1}` }));
}

/** The stages to draw: the extracted ones, or one stage per step for a
 * diagram saved before stages existed. */
export function stagesOf(diagram: WorkflowDiagram): WorkflowStage[] {
  if (diagram.stages && diagram.stages.length > 0) return diagram.stages;
  return diagram.steps.map((step, i) => ({
    id: `stage-${i + 1}`,
    title: step.label,
    summary: step.description,
    stepIds: [step.id],
  }));
}

/** "Step 4" or "Steps 4 to 6", numbered by position in the diagram. */
export function stepRangeLabel(diagram: WorkflowDiagram, stage: WorkflowStage): string {
  const positions = stage.stepIds
    .map((id) => diagram.steps.findIndex((step) => step.id === id) + 1)
    .filter((n) => n > 0);
  if (positions.length === 0) return "";
  const first = Math.min(...positions);
  const last = Math.max(...positions);
  return first === last ? `Step ${first}` : `Steps ${first} to ${last}`;
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
