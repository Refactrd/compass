import type {
  Bottleneck,
  Findings,
  FixType,
  StressKind,
  StressScenario,
} from "@/lib/immersion/bottleneck-extraction";
import {
  stagesOf,
  stepRangeLabel,
  type ScenarioResult,
  type StressOutcome,
  type WorkflowDiagram,
  type WorkflowStage,
  type WorkflowStep,
} from "@/lib/immersion/diagram-schema";
import type { Level, OpportunityMapping, Solution } from "@/lib/immersion/opportunity-mapping";
import { computeScaleReadiness } from "@/lib/immersion/workflow-score";

/**
 * One stage, ready to draw: the shape both the on-screen diagram
 * (components/immersion/workflow-diagram.tsx) and the PDFs
 * (lib/immersion/pdf/shared.tsx) render from, so the two can never disagree
 * about which bottleneck or opportunity sits under which stage.
 */
export type StageView = {
  stage: WorkflowStage;
  number: number;
  stepRange: string;
  steps: WorkflowStep[];
  bottlenecks: string[];
  opportunities: string[];
};

export function buildStageViews(
  diagram: WorkflowDiagram,
  bottlenecks?: Bottleneck[] | null,
  opportunityMapping?: OpportunityMapping | null,
): StageView[] {
  const stepById = new Map(diagram.steps.map((step) => [step.id, step]));

  return stagesOf(diagram).map((stage, i) => {
    const inStage = new Set(stage.stepIds);
    const stageBottlenecks = (bottlenecks ?? []).filter((b) => inStage.has(b.stepId));

    let opportunities = (opportunityMapping?.opportunities ?? [])
      .filter((o) => inStage.has(o.stepId))
      .map((o) => o.text);
    if (!opportunityMapping?.opportunities && opportunityMapping) {
      // Mappings saved before per-stage opportunity lines existed: show what
      // the solutions addressing this stage's bottlenecks do instead.
      const ids = new Set(stageBottlenecks.map((b) => b.stepId));
      opportunities = opportunityMapping.solutions
        .filter((s) => s.addressesBottleneckStepIds.some((id) => ids.has(id)))
        .map((s) => s.summary ?? s.title);
    }

    return {
      stage,
      number: i + 1,
      stepRange: stepRangeLabel(diagram, stage),
      steps: stage.stepIds
        .map((id) => stepById.get(id))
        .filter((step): step is WorkflowStep => step !== undefined),
      bottlenecks: stageBottlenecks.map((b) => b.description),
      opportunities: [...new Set(opportunities)],
    };
  });
}

/** Splits stages into rows of `size`, the fixed four-across template. */
export function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

export const TIMELINE_BY_TIER: Record<Solution["tier"], string> = {
  priority: "Days 1 to 30",
  recommended: "Days 31 to 60",
  "nice-to-have": "Days 61 to 90",
};

export const LEVEL_LABEL: Record<Level, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** "Unchanged", "Assistant", ... the pill on a transformed stage card. */
export function stageTag(stage: WorkflowStage): string {
  if (stage.tag) return stage.tag;
  if (stage.mode === "unchanged") return "Unchanged";
  if (stage.mode === "automated") return "Automated";
  return "Your team";
}

export const FIX_TYPE_LABEL: Record<FixType, string> = {
  ai: "AI",
  automation: "Automation",
  system: "Central system",
  process: "Process change",
};

export const STRESS_KIND_LABEL: Record<StressKind, string> = {
  people: "Key person",
  volume: "Demand surge",
  records: "Lost records",
  dependency: "Outside dependency",
};

export const OUTCOME_LABEL: Record<StressOutcome, string> = {
  breaks: "Breaks",
  strains: "Strains",
  holds: "Holds",
};

/** One stress scenario with how today's workflow fares and, once the
 * transformed workflow exists, how that fares too. */
export type StressView = {
  scenario: StressScenario;
  after: ScenarioResult | null;
};

export function buildStressViews(
  findings?: Findings | null,
  afterDiagram?: WorkflowDiagram | null,
): StressView[] {
  const results = new Map((afterDiagram?.resilience ?? []).map((r) => [r.scenarioId, r]));
  return (findings?.scenarios ?? []).map((scenario) => ({
    scenario,
    after: results.get(scenario.id) ?? null,
  }));
}

/** Scale readiness today and after transformation. `after` is null until the
 * transformed workflow has been stress-tested; a scenario it did not judge
 * keeps today's outcome rather than being assumed fixed. */
export function readinessScores(views: StressView[]): { today: number | null; after: number | null } {
  const today = computeScaleReadiness(views.map((v) => v.scenario.outcome));
  const tested = views.some((v) => v.after);
  const after = tested
    ? computeScaleReadiness(views.map((v) => v.after?.outcome ?? v.scenario.outcome))
    : null;
  return { today, after };
}
