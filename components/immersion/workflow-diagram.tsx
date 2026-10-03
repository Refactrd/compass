import { refactrdBrand } from "@/brand/token";
import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";

/**
 * The one fixed template for both the "before" and "after" diagrams
 * (CLAUDE.md, Phase 2 non-negotiable: no React Flow, dagre, or elk).
 *
 * Position is never computed. Steps render as a vertical stepper in array
 * order, a plain numbered card connected by a straight line, because that is
 * what an ordered sequence of steps actually is. A branch is not drawn as a
 * curved graph edge, it is rendered as a labeled badge on its source step's
 * card, "if <condition>, skip to step N". That is a deliberate simplification,
 * not a shortcut: a real department workflow from an interview is close to
 * linear with the occasional decision point (CLAUDE.md), and a badge says
 * that clearly without the class of bug a curve-drawing routine invites
 * (overlapping paths, ambiguous crossing lines) for a case that is rare by
 * design.
 *
 * Inline styles only, no Tailwind classes: this same component is what
 * renders into the client-facing PDF (Phase 2 days 6-8), and inline styles
 * are what survive that translation intact regardless of what actually does
 * the HTML-to-PDF conversion.
 *
 * Refactrd's real brand, not Compass's own ink/off-white/brass system: this
 * previews exactly what the client will see in the PDF, so it has to look
 * like that PDF, not like the rest of the Compass admin/consultant UI
 * chrome around it.
 */

const { colors, typography } = refactrdBrand;

export function WorkflowDiagramView({
  diagram,
  title,
}: {
  diagram: WorkflowDiagram;
  title?: string;
}) {
  if (diagram.steps.length === 0) {
    return (
      <div
        style={{
          fontFamily: typography.body.fontFamily,
          color: colors.text,
          padding: "24px",
          textAlign: "center",
          border: `1px dashed ${colors.tertiary}`,
          borderRadius: "8px",
          backgroundColor: colors.background,
        }}
      >
        No workflow could be extracted from this transcript yet.
      </div>
    );
  }

  const branchesByFromStep = new Map<string, typeof diagram.branches>();
  for (const branch of diagram.branches) {
    const list = branchesByFromStep.get(branch.fromStepId) ?? [];
    list.push(branch);
    branchesByFromStep.set(branch.fromStepId, list);
  }
  const stepIndexById = new Map(diagram.steps.map((step, i) => [step.id, i + 1]));

  return (
    <div
      style={{
        fontFamily: typography.body.fontFamily,
        color: colors.text,
        backgroundColor: colors.background,
        padding: "32px",
      }}
    >
      {title ? (
        <h2
          style={{
            fontFamily: typography.heading.fontFamily,
            color: colors.primary,
            fontSize: "20px",
            fontWeight: 700,
            margin: "0 0 24px",
          }}
        >
          {title}
        </h2>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {diagram.steps.map((step, index) => {
          const isLast = index === diagram.steps.length - 1;
          const branches = branchesByFromStep.get(step.id) ?? [];

          return (
            <div key={step.id} style={{ display: "flex" }}>
              {/* Rail: numbered circle + connecting line, fixed geometry. */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: "40px",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "999px",
                    backgroundColor: colors.primary,
                    color: colors.background,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "13px",
                    fontWeight: 700,
                    fontFamily: typography.heading.fontFamily,
                    flexShrink: 0,
                  }}
                >
                  {index + 1}
                </div>
                {!isLast ? (
                  <div
                    style={{
                      width: "2px",
                      flex: 1,
                      minHeight: "24px",
                      backgroundColor: colors.tertiary,
                    }}
                  />
                ) : null}
              </div>

              {/* Step card. */}
              <div style={{ flex: 1, paddingBottom: isLast ? 0 : "16px", paddingLeft: "16px" }}>
                <div
                  style={{
                    border: `1px solid ${colors.tertiary}`,
                    borderRadius: "10px",
                    padding: "14px 16px",
                    backgroundColor: "#ffffff",
                  }}
                >
                  {/* Column, not a label-beside-actor row: a real dry run
                      found a long actor description (e.g. "Saabay
                      Finance/Accounting Representative and Saabay Service
                      Lead") forced the label into a few remaining pixels of
                      row width and wrapped it into a near-unreadable stack of
                      one-word lines. Stacking avoids the two ever competing
                      for horizontal space at all. */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: typography.heading.fontFamily,
                        fontSize: "15px",
                        fontWeight: 600,
                        color: colors.text,
                      }}
                    >
                      {step.label}
                    </p>
                    {step.actor ? (
                      <span
                        style={{
                          alignSelf: "flex-start",
                          fontSize: "11px",
                          fontWeight: 600,
                          color: colors.accent,
                          backgroundColor: colors.tertiary,
                          padding: "2px 8px",
                          borderRadius: "999px",
                        }}
                      >
                        {step.actor}
                      </span>
                    ) : null}
                  </div>

                  {step.description ? (
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: "13px",
                        lineHeight: "19px",
                        color: colors.text,
                        opacity: 0.75,
                      }}
                    >
                      {step.description}
                    </p>
                  ) : null}

                  {branches.map((branch, i) => {
                    const targetIndex = stepIndexById.get(branch.toStepId);
                    return (
                      <div
                        key={i}
                        style={{
                          marginTop: "10px",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "12px",
                          color: colors.primary,
                          backgroundColor: colors.secondary,
                          padding: "6px 10px",
                          borderRadius: "6px",
                        }}
                      >
                        <span aria-hidden="true">&rarr;</span>
                        <span>
                          If {branch.condition}, skip to step {targetIndex ?? "?"}.
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default WorkflowDiagramView;
