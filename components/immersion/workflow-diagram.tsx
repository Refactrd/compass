import { UserCheck } from "lucide-react";

import {
  body,
  card,
  colors,
  eyebrow,
  Grid,
  heading,
  Pill,
  ReportHeader,
  ReportShell,
  wf,
} from "@/components/immersion/report-ui";
import type { Bottleneck } from "@/lib/immersion/bottleneck-extraction";
import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import type { OpportunityMapping } from "@/lib/immersion/opportunity-mapping";
import { buildStageViews, stageTag, type StageView } from "@/lib/immersion/stage-view";

/**
 * The one fixed template for both diagrams (CLAUDE.md, Phase 2
 * non-negotiable: no React Flow, dagre, or elk), modelled on the approved SA
 * Logistics findings report: steps are grouped into stages and drawn as a
 * grid of stage cards in order, never as a graph.
 *
 * Current workflow: where the client is today. Each stage card is tagged,
 * not expanded: a "Bottleneck" or "Opportunity" pill says this stage has
 * one (hover for the text), and the detail lives in the What we found and
 * Recommendations tabs, so this tab stays a clean map of the work.
 *
 * Transformed workflow: one card per new stage, dark when AI, automation or
 * a system does the work, white when the client's team still does it. Each
 * names the builds that power it and, where a decision still matters, the
 * human in the loop, then ends in what it replaces.
 *
 * The client-facing PDF (lib/immersion/pdf/shared.tsx) keeps the report's
 * full bottleneck and opportunity cards on the current workflow page, since
 * a printed page has no hover and no other tab to look in.
 */

/** The individual steps behind a stage, folded away: the stage is the view,
 * the consultant can still check every step. */
function StepDetails({ view, diagram, dark }: { view: StageView; diagram: WorkflowDiagram; dark?: boolean }) {
  const positionById = new Map(diagram.steps.map((step, i) => [step.id, i + 1]));
  return (
    <details style={{ marginTop: "12px" }}>
      <summary
        style={{ cursor: "pointer", fontSize: "11px", fontWeight: 600, color: dark ? colors.secondary : wf.muted }}
      >
        {`Show steps · ${view.stepRange}`}
      </summary>
      <ol style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>
        {view.steps.map((step) => (
          <li key={step.id} style={{ fontSize: "12px", lineHeight: "17px", marginTop: "6px" }}>
            <span style={{ fontWeight: 600 }}>{`${positionById.get(step.id)}. ${step.label}`}</span>
            {step.actor ? <span style={{ opacity: 0.7 }}>{` · ${step.actor}`}</span> : null}
            {diagram.branches
              .filter((branch) => branch.fromStepId === step.id)
              .map((branch, i) => (
                <span key={i} style={{ display: "block", opacity: 0.75, fontStyle: "italic" }}>
                  {`If ${branch.condition}, skip to step ${positionById.get(branch.toStepId) ?? "?"}.`}
                </span>
              ))}
          </li>
        ))}
      </ol>
    </details>
  );
}

function Empty() {
  return (
    <ReportShell>
      <div
        style={{
          padding: "32px",
          textAlign: "center",
          border: `1px dashed ${wf.stageBorder}`,
          borderRadius: "12px",
          color: wf.muted,
        }}
      >
        No workflow could be extracted from this transcript yet.
      </div>
    </ReportShell>
  );
}

function StageNumber({ n, dark }: { n: number; dark?: boolean }) {
  return (
    <p style={{ ...eyebrow, color: dark ? colors.secondary : colors.accent }}>
      {`Stage ${String(n).padStart(2, "0")}`}
    </p>
  );
}

export function CurrentWorkflowView({
  diagram,
  departmentName,
  bottlenecks,
  opportunityMapping,
}: {
  diagram: WorkflowDiagram;
  departmentName: string;
  bottlenecks?: Bottleneck[] | null;
  opportunityMapping?: OpportunityMapping | null;
}) {
  if (diagram.steps.length === 0) return <Empty />;

  const views = buildStageViews(diagram, bottlenecks, opportunityMapping);
  const analysed = Boolean(bottlenecks);
  const flagged = views.filter((view) => view.bottlenecks.length > 0).length;

  return (
    <ReportShell>
      <ReportHeader
        kicker="Where you are today"
        title={`Current workflow: ${departmentName}`}
        subtitle="How the work runs today, stage by stage. Tagged stages have a bottleneck or an opportunity; the detail is in What we found and Recommendations."
        stats={[
          { label: "steps today", value: String(diagram.steps.length) },
          { label: "stages", value: String(views.length) },
          ...(analysed ? [{ label: "stages with a bottleneck", value: `${flagged} of ${views.length}` }] : []),
        ]}
        legend={
          analysed
            ? [
                { swatch: { backgroundColor: wf.bottleneckFill, border: `1px solid ${wf.bottleneckEdge}` }, label: "Has a bottleneck" },
                { swatch: { backgroundColor: wf.opportunityFill, border: `1px solid ${colors.accent}` }, label: "Has an opportunity" },
              ]
            : []
        }
      />
      <Grid min={230}>
        {views.map((view) => {
          const hasBottleneck = view.bottlenecks.length > 0;
          return (
            <div
              key={view.stage.id}
              style={{
                ...card,
                backgroundColor: colors.tertiary,
                borderColor: wf.stageBorder,
                borderTop: `3px solid ${hasBottleneck ? wf.bottleneckEdge : wf.stageBorder}`,
              }}
            >
              <StageNumber n={view.number} />
              <p style={{ ...heading, fontSize: "16px", lineHeight: 1.25, marginTop: "6px" }}>{view.stage.title}</p>
              {view.stage.summary ? <p style={{ ...body, color: wf.muted }}>{view.stage.summary}</p> : null}
              {analysed && (hasBottleneck || view.opportunities.length > 0) ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "auto", paddingTop: "14px" }}>
                  {hasBottleneck ? (
                    <Pill tone="amber" title={view.bottlenecks.join(" ")}>
                      Bottleneck
                    </Pill>
                  ) : null}
                  {view.opportunities.length > 0 ? (
                    <Pill tone="azure" title={view.opportunities.join(" ")}>
                      Opportunity
                    </Pill>
                  ) : null}
                </div>
              ) : null}
              <StepDetails view={view} diagram={diagram} />
            </div>
          );
        })}
      </Grid>
    </ReportShell>
  );
}

export function TransformedWorkflowView({
  diagram,
  before,
  departmentName,
  readiness,
}: {
  diagram: WorkflowDiagram;
  before?: WorkflowDiagram | null;
  departmentName: string;
  /** Scale readiness today and after, from the stress test, when there is one. */
  readiness?: { today: number | null; after: number | null };
}) {
  if (diagram.steps.length === 0) return <Empty />;

  const views = buildStageViews(diagram);
  const afterCount = diagram.steps.length;
  const beforeCount = before?.steps.length ?? 0;
  const automated = views.filter((view) => view.stage.mode === "automated").length;
  const checkpoints = views.filter((view) => view.stage.humanCheckpoint).length;

  return (
    <ReportShell>
      <ReportHeader
        kicker="Where you are going"
        title={`Transformed workflow: ${departmentName}`}
        subtitle="Machines take the repetitive, high-volume work; people keep the decisions that matter. Built to hold up when a key person is away or demand surges."
        stats={[
          {
            label: "steps",
            value: beforeCount > afterCount ? `${beforeCount} → ${afterCount}` : String(afterCount),
          },
          ...(readiness?.today != null && readiness.after != null
            ? [{ label: "scale readiness", value: `${readiness.today} → ${readiness.after}` }]
            : []),
          { label: "stages automated", value: `${automated} of ${views.length}` },
          { label: "human checkpoints", value: String(checkpoints) },
        ]}
        legend={[
          { swatch: { backgroundColor: colors.primary }, label: "AI, automation or system" },
          { swatch: { backgroundColor: "#ffffff", border: `1px solid ${wf.stageBorder}` }, label: "Your team, with better information" },
          { swatch: { backgroundColor: wf.opportunityFill, borderLeft: `3px solid ${colors.accent}` }, label: "Human in the loop" },
        ]}
      />
      <Grid min={240}>
        {views.map((view) => {
          const dark = view.stage.mode === "automated";
          const unchanged = view.stage.mode === "unchanged";
          return (
            <div
              key={view.stage.id}
              style={{
                ...card,
                backgroundColor: dark ? colors.primary : "#ffffff",
                color: dark ? colors.background : colors.primary,
                borderColor: dark ? colors.primary : wf.stageBorder,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                <StageNumber n={view.number} dark={dark} />
                <Pill tone={unchanged ? "muted" : "azure"}>{stageTag(view.stage)}</Pill>
              </div>
              <p style={{ ...heading, color: "inherit", fontSize: "17px", lineHeight: 1.25, marginTop: "10px" }}>
                {view.stage.title}
              </p>
              {view.stage.summary ? (
                <p style={{ ...body, color: dark ? "rgba(251,251,251,0.82)" : wf.muted }}>{view.stage.summary}</p>
              ) : null}
              {view.stage.builds && view.stage.builds.length > 0 ? (
                <div style={{ marginTop: "14px" }}>
                  <p style={{ ...eyebrow, fontSize: "9.5px", color: dark ? colors.secondary : colors.accent }}>Powered by</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "6px" }}>
                    {view.stage.builds.map((build) => (
                      <span
                        key={build}
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "3px 8px",
                          borderRadius: "6px",
                          backgroundColor: dark ? "rgba(162,210,255,0.16)" : colors.tertiary,
                        }}
                      >
                        {build}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {view.stage.humanCheckpoint ? (
                <div
                  style={{
                    marginTop: "14px",
                    padding: "9px 10px",
                    borderRadius: "8px",
                    borderLeft: `3px solid ${dark ? colors.secondary : colors.accent}`,
                    backgroundColor: dark ? "rgba(162,210,255,0.12)" : wf.opportunityFill,
                    display: "flex",
                    gap: "8px",
                  }}
                >
                  <UserCheck
                    aria-hidden="true"
                    style={{ width: "14px", height: "14px", flexShrink: 0, marginTop: "1px", color: dark ? colors.secondary : colors.accent }}
                  />
                  <div>
                    <p style={{ ...eyebrow, fontSize: "9.5px", color: dark ? colors.secondary : colors.accent }}>Human in the loop</p>
                    <p style={{ margin: "3px 0 0", fontSize: "12px", lineHeight: "17px" }}>{view.stage.humanCheckpoint}</p>
                  </div>
                </div>
              ) : null}
              <StepDetails view={view} diagram={diagram} dark={dark} />
              {view.stage.replaces ? (
                <div
                  style={{
                    marginTop: "auto",
                    paddingTop: "14px",
                  }}
                >
                  <div style={{ borderTop: `1px solid ${dark ? "rgba(162,210,255,0.25)" : wf.stageBorder}`, paddingTop: "10px" }}>
                    <p style={{ ...eyebrow, fontSize: "9.5px", color: dark ? colors.secondary : colors.accent }}>Replaces</p>
                    <p style={{ margin: "4px 0 0", fontSize: "12px", lineHeight: "17px", color: dark ? "rgba(251,251,251,0.72)" : wf.muted }}>
                      {view.stage.replaces}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </Grid>
    </ReportShell>
  );
}
