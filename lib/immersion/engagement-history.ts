import "server-only";

import type { Bottleneck } from "@/lib/immersion/bottleneck-extraction";
import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import type { OpportunityMapping } from "@/lib/immersion/opportunity-mapping";

/**
 * Formats a Client's past immersion days into text the main chat's system
 * prompt can inject, so a consultant can ask "what bottlenecks did Bellview's
 * customer support have, and what did we recommend" in the ordinary chat
 * workspace, not just from inside that Engagement's own workspace.
 *
 * Structured lookup, not vector retrieval: once a Client is linked to a
 * conversation (the existing fuzzy-match/context-panel mechanism CLAUDE.md
 * already specifies), which department had which bottleneck and which
 * solution was recommended is exact relational data sitting in Postgres, not
 * something to approximate through embedding similarity. This stays inside
 * "one system prompt, one model call, no tool-calling" (CLAUDE.md
 * non-negotiable): it is one more thing folded into the existing Client
 * Context section, not a new retrieval pass or a second orchestration layer.
 *
 * Archived engagements (migration 0010) are excluded by the caller's query,
 * the same as they are excluded from /engagements: archiving something in
 * this product means taking it out of everyday visibility, chat included.
 */

export type DepartmentHistory = {
  name: string;
  beforeDiagram: WorkflowDiagram | null;
  bottlenecks: Bottleneck[] | null;
  opportunityMapping: OpportunityMapping | null;
};

export type EngagementHistory = {
  date: string;
  departments: DepartmentHistory[];
};

const TIER_LABEL: Record<OpportunityMapping["solutions"][number]["tier"], string> = {
  priority: "Priority",
  recommended: "Recommended",
  "nice-to-have": "Nice to have",
};

export function formatEngagementHistory(engagements: EngagementHistory[]): string | null {
  const blocks = engagements
    .map((engagement) => formatEngagement(engagement))
    .filter((block): block is string => block !== null);

  if (blocks.length === 0) return null;
  return blocks.join("\n\n");
}

function formatEngagement(engagement: EngagementHistory): string | null {
  const departmentBlocks = engagement.departments
    .map((department) => formatDepartment(department))
    .filter((block): block is string => block !== null);

  if (departmentBlocks.length === 0) return null;

  return `Immersion day, ${engagement.date}:\n${departmentBlocks.join("\n")}`;
}

function formatDepartment(department: DepartmentHistory): string | null {
  const hasBottlenecks = department.bottlenecks && department.bottlenecks.length > 0;
  const hasSolutions =
    department.opportunityMapping && department.opportunityMapping.solutions.length > 0;
  if (!hasBottlenecks && !hasSolutions) return null;

  const stepLabel = (stepId: string) =>
    department.beforeDiagram?.steps.find((step) => step.id === stepId)?.label ?? stepId;

  const lines: string[] = [`- ${department.name}:`];

  if (hasBottlenecks) {
    for (const bottleneck of department.bottlenecks!) {
      lines.push(`  Bottleneck at "${stepLabel(bottleneck.stepId)}": ${bottleneck.description}`);
    }
  }

  if (hasSolutions) {
    for (const solution of department.opportunityMapping!.solutions) {
      const timeSaved = solution.timeSavedEstimate
        ? ` (est. ${solution.timeSavedEstimate})`
        : "";
      lines.push(
        `  Recommended, ${TIER_LABEL[solution.tier]}: ${solution.title}${timeSaved}: ${solution.rationale}`,
      );
    }
  }

  return lines.join("\n");
}
