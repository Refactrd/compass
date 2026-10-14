import { FORCED_LIGHT_VARS } from "@/components/immersion/forced-light";
import type { Bottleneck } from "@/lib/immersion/bottleneck-extraction";
import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import { bracketFor, computeWorkflowScore } from "@/lib/immersion/workflow-score";

/**
 * Bottlenecks on their own, split out of what used to be one combined
 * "Bottlenecks & solutions" tab. CLAUDE.md's Phase 2 non-negotiable is
 * grounding, not layout, so splitting this does not touch what is shown,
 * only how much a consultant has to take in on one screen. See SolutionsView
 * for the other half.
 *
 * Card styling deliberately plain (a bordered row, no icon badge, no
 * blockquote treatment): an icon-badge redesign tried here read as busier
 * and less clean, caught live, reverted back to the original compact card.
 * The health bracket above it is new and unrelated to that reversion.
 *
 * Forced light, same as the diagram tabs either side of it in the result
 * panel: see components/immersion/forced-light.ts.
 */
export function BottlenecksView({
  bottlenecks,
  diagram,
}: {
  bottlenecks: Bottleneck[];
  diagram: WorkflowDiagram;
}) {
  const stepLabel = (stepId: string) =>
    diagram.steps.find((step) => step.id === stepId)?.label ?? stepId;
  const { score } = computeWorkflowScore(bottlenecks.length);
  const bracket = bracketFor(score);

  return (
    <div className="flex flex-col gap-6 bg-surface p-4 text-ink" style={FORCED_LIGHT_VARS}>
      <div className="flex items-center gap-4 rounded-xl border border-border-strong bg-surface-sunken px-4 py-3.5">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-brass bg-surface font-display text-lg font-bold text-brass-strong"
          aria-hidden="true"
        >
          {bracket.grade}
        </div>
        <div>
          <p className="text-sm font-medium text-ink">
            Workflow health: {bracket.label}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate">
            {bracket.description} Based on the number of bottlenecks found in
            this department&apos;s interview, not a measured or sourced figure.
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-ink">
          Bottlenecks ({bottlenecks.length})
        </h3>
        {bottlenecks.length === 0 ? (
          <p className="mt-3 text-sm text-slate">
            No bottlenecks identified from this interview.
          </p>
        ) : (
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
        )}
      </div>
    </div>
  );
}

export default BottlenecksView;
