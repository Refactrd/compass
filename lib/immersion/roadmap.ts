import type { Solution } from "@/lib/immersion/opportunity-mapping";

/**
 * The 90-day roadmap, one per department, feeding the Comprehensive Report
 * (CLAUDE.md, Phase 2 days 10-11).
 *
 * Deliberately not a fifth AI call. CLAUDE.md's grounding discipline for this
 * phase is absolute, and the tiers Opportunity Mapping already assigned
 * (priority, recommended, nice-to-have) already encode a sequence: do the
 * best-grounded, highest-impact, smallest-sufficient solution first, per
 * Refactrd's own methodology of preferring the smallest sufficient
 * intervention. Turning that into a phased timeline is pure sequencing over
 * data that is already grounded, not a new claim about anything, so a
 * deterministic mapping is exactly as grounded as the solutions themselves,
 * and carries zero risk of a model inventing a timeline commitment the
 * material does not support.
 */

export type RoadmapPhase = {
  label: string;
  rangeDays: string;
  solutions: Solution[];
};

export type Roadmap = {
  phases: RoadmapPhase[];
};

const PHASES: { tier: Solution["tier"]; label: string; rangeDays: string }[] = [
  { tier: "priority", label: "Now", rangeDays: "Days 1 to 30" },
  { tier: "recommended", label: "Next", rangeDays: "Days 31 to 60" },
  { tier: "nice-to-have", label: "Later", rangeDays: "Days 61 to 90" },
];

export function buildRoadmap(solutions: Solution[]): Roadmap {
  const phases = PHASES.map((phase) => ({
    label: phase.label,
    rangeDays: phase.rangeDays,
    solutions: solutions.filter((solution) => solution.tier === phase.tier),
  })).filter((phase) => phase.solutions.length > 0);

  return { phases };
}

export type EngagementRoadmapSolution = {
  departmentName: string;
  solution: Solution;
};

export type EngagementRoadmapPhase = {
  label: string;
  rangeDays: string;
  entries: EngagementRoadmapSolution[];
};

export type EngagementRoadmap = {
  phases: EngagementRoadmapPhase[];
};

/**
 * The Comprehensive Report's organization-wide roadmap (CLAUDE.md's 90-day
 * roadmap, reworked from per-department into one shared Day 0-30 / 30-60 /
 * 60-90 sequence spanning every department in the Engagement). Same
 * tier-to-phase mapping as buildRoadmap, just pooled across departments
 * instead of scoped to one, each entry keeping its department name so the
 * report's table can say which department a solution belongs to.
 */
export function buildEngagementRoadmap(
  departments: { name: string; solutions: Solution[] }[],
): EngagementRoadmap {
  const phases = PHASES.map((phase) => ({
    label: phase.label,
    rangeDays: phase.rangeDays,
    entries: departments.flatMap((department) =>
      department.solutions
        .filter((solution) => solution.tier === phase.tier)
        .map((solution) => ({ departmentName: department.name, solution })),
    ),
  })).filter((phase) => phase.entries.length > 0);

  return { phases };
}
