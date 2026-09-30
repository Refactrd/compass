import type { Bottleneck } from "@/lib/immersion/bottleneck-extraction";
import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import type { OpportunityMapping } from "@/lib/immersion/opportunity-mapping";
import { cn } from "@/lib/utils";

/**
 * Bottlenecks and tiered solutions, Compass's own admin/consultant chrome
 * (unlike WorkflowDiagramView, this is not part of the client-facing PDF, it
 * is the internal review surface a consultant checks before generating one).
 *
 * Every solution's grounding is shown, not hidden: CLAUDE.md's Phase 2
 * grounding discipline says to flag anything not clearly traceable rather
 * than smooth it over. opportunity-mapping.ts already drops a solution with
 * no real grounding entirely, so what reaches this component is always
 * grounded, but a consultant still deserves to see what it is grounded in
 * before it goes in front of a client, which is what the chips below do.
 */

const TIER_LABEL: Record<string, string> = {
  priority: "Priority",
  recommended: "Recommended",
  "nice-to-have": "Nice to have",
};

const TIER_STYLE: Record<string, string> = {
  priority: "bg-brass text-white",
  recommended: "bg-brass-tint text-brass-strong",
  "nice-to-have": "bg-surface-sunken text-slate",
};

export function OpportunityMappingView({
  bottlenecks,
  opportunityMapping,
  diagram,
}: {
  bottlenecks: Bottleneck[];
  opportunityMapping: OpportunityMapping;
  diagram: WorkflowDiagram;
}) {
  const stepLabel = (stepId: string) =>
    diagram.steps.find((step) => step.id === stepId)?.label ?? stepId;

  return (
    <div className="flex flex-col gap-6">
      {!opportunityMapping.categoryMaterialAvailable ? (
        <p className="rounded-lg border border-border-strong bg-surface-sunken px-3 py-2 text-xs text-slate">
          No Refactrd tools, stack, constraints, or engineering-docs material
          has been ingested yet. The solutions below are grounded in the
          transcript only, not in specific Refactrd tooling.
        </p>
      ) : null}

      <div>
        <h3 className="text-sm font-medium text-ink">
          Bottlenecks ({bottlenecks.length})
        </h3>
        <ul className="mt-2 flex flex-col gap-2">
          {bottlenecks.map((bottleneck, i) => (
            <li
              key={i}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <p className="font-medium text-ink">{stepLabel(bottleneck.stepId)}</p>
              <p className="mt-0.5 text-ink-muted">{bottleneck.description}</p>
              <p className="mt-1 text-xs text-slate-light">
                Evidence: {bottleneck.evidence}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-medium text-ink">
          Solutions ({opportunityMapping.solutions.length})
        </h3>
        <ul className="mt-2 flex flex-col gap-3">
          {opportunityMapping.solutions.map((solution, i) => (
            <li key={i} className="rounded-lg border border-border bg-surface px-3 py-3 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    TIER_STYLE[solution.tier],
                  )}
                >
                  {TIER_LABEL[solution.tier]}
                </span>
                <p className="font-medium text-ink">{solution.title}</p>
              </div>
              <p className="mt-1.5 text-ink-muted">{solution.rationale}</p>
              {solution.timeSavedEstimate ? (
                <p className="mt-1.5 text-xs font-medium text-brass-strong">
                  Estimated time saved: {solution.timeSavedEstimate}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-slate-light">
                  No time-saved figure. Not clearly supported by the transcript
                  or retrieved material.
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {solution.groundedIn.map((ground, j) => (
                  <span
                    key={j}
                    className="rounded-md border border-border-strong bg-surface-sunken px-1.5 py-0.5 text-[11px] text-slate"
                    title={ground.detail}
                  >
                    {ground.source === "transcript" ? "Transcript" : "Document"}:{" "}
                    {ground.detail.length > 60
                      ? `${ground.detail.slice(0, 60)}…`
                      : ground.detail}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default OpportunityMappingView;
