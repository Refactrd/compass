import { refactrdBrand } from "@/brand/token";
import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";

/**
 * The one fixed template for both the "before" and "after" diagrams
 * (CLAUDE.md, Phase 2 non-negotiable: no React Flow, dagre, or elk).
 *
 * Redesigned from a numbered list into an actual flowchart after a real dry
 * run read the list as "that long list," not a flowchart: a single centered
 * column of boxes connected by a straight arrow, one box directly below the
 * one before it. Position is still never computed, only assigned by array
 * order, exactly as before: a flowchart look does not require a flowchart
 * layout engine when the underlying shape is already a mostly-linear
 * sequence. A branch is still not drawn as a curved graph edge to its
 * target, which could be anywhere in the list; it renders as a small
 * side-indicator on its source step's box, visually distinct (dashed
 * border, turn arrow) from the main downward flow, so there is nothing here
 * for a layout algorithm to compute or get wrong.
 *
 * Responsive by construction rather than by breakpoint: the column has a
 * max width and centers itself, every box is `width: 100%` of that column,
 * and text wraps normally (no nowrap, no fixed height) instead of being
 * clipped. The real fix for "words flowing out of the boxes" happens one
 * layer down, in extraction and revision (lib/immersion/transcript-
 * extraction.ts): labels are now constrained to one short sentence at
 * generation time, not just visually truncated after the fact.
 *
 * Inline styles only, no Tailwind classes: react-pdf cannot render regular
 * DOM/HTML anyway, so lib/immersion/pdf/shared.tsx is a separate, parallel
 * implementation of this same template for the actual PDF, not this
 * component reused. Inline styles here are just this component's own
 * choice, independent of that.
 *
 * Colors are Refactrd's real brand, matching the PDF this previews: a
 * consultant reviewing this screen is looking at the shape of what a client
 * will actually receive. Typography is deliberately NOT the brand's (a real
 * dry run flagged the mismatch): this is a screen inside Compass's own app
 * chrome, not the document itself, so headings and body text use Compass's
 * own fonts (the same `--font-display` / `--font-sans` the rest of the app
 * renders in) rather than Refactrd's Poppins/Montserrat, which are not even
 * loaded as web fonts in the browser, only embedded server-side for the PDF
 * (lib/immersion/pdf/shared.tsx's Font.register), so referencing them here
 * was never actually rendering as Poppins at all, just whatever generic
 * sans-serif the browser fell back to.
 */

const { colors } = refactrdBrand;
const typography = {
  heading: { fontFamily: "var(--font-display)" },
  body: { fontFamily: "var(--font-sans)" },
};

const MAX_COLUMN_WIDTH = 480;

function ArrowConnector() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
      }}
    >
      <div style={{ width: "2px", height: "20px", backgroundColor: colors.tertiary }} />
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderTop: `7px solid ${colors.tertiary}`,
        }}
      />
    </div>
  );
}

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
        padding: "32px 16px",
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
            textAlign: "center",
          }}
        >
          {title}
        </h2>
      ) : null}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          maxWidth: `${MAX_COLUMN_WIDTH}px`,
          margin: "0 auto",
        }}
      >
        {diagram.steps.map((step, index) => {
          const isLast = index === diagram.steps.length - 1;
          const branches = branchesByFromStep.get(step.id) ?? [];

          return (
            <div key={step.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
              <div
                style={{
                  width: "100%",
                  border: `1px solid ${colors.tertiary}`,
                  borderRadius: "10px",
                  padding: "14px 16px",
                  backgroundColor: "#ffffff",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontFamily: typography.heading.fontFamily,
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: colors.accent,
                  }}
                >
                  {`Step ${index + 1}`}
                </p>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontFamily: typography.heading.fontFamily,
                    fontSize: "15px",
                    fontWeight: 600,
                    color: colors.text,
                    // Wraps normally; no nowrap, no clipping. The label is
                    // short by construction (one sentence, extraction-time),
                    // this is just not actively fighting a long one.
                    overflowWrap: "break-word",
                  }}
                >
                  {step.label}
                </p>

                {step.actor ? (
                  <span
                    style={{
                      display: "inline-block",
                      marginTop: "8px",
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

                {step.description ? (
                  <p
                    style={{
                      margin: "8px 0 0",
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
                        justifyContent: "center",
                        gap: "6px",
                        fontSize: "12px",
                        color: colors.primary,
                        backgroundColor: "#ffffff",
                        border: `1px dashed ${colors.secondary}`,
                        padding: "6px 10px",
                        borderRadius: "6px",
                      }}
                    >
                      <span aria-hidden="true">&#8618;</span>
                      <span>
                        If {branch.condition}, skip to step {targetIndex ?? "?"}.
                      </span>
                    </div>
                  );
                })}
              </div>

              {!isLast ? <ArrowConnector /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default WorkflowDiagramView;
