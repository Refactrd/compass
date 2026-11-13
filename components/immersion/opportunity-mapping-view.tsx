import {
  body,
  card,
  colors,
  eyebrow,
  Folded,
  Grid,
  heading,
  NumberBadge,
  Pill,
  ReportHeader,
  ReportShell,
  Section,
  wf,
  type Tone,
} from "@/components/immersion/report-ui";
import type { Bottleneck, FixType } from "@/lib/immersion/bottleneck-extraction";
import type { StressOutcome, WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import type { OpportunityMapping } from "@/lib/immersion/opportunity-mapping";
import {
  buildStageViews,
  buildStressViews,
  FIX_TYPE_LABEL,
  OUTCOME_LABEL,
  readinessScores,
  STRESS_KIND_LABEL,
} from "@/lib/immersion/stage-view";
import {
  computeWorkflowScore,
  SCALE_READINESS_RULE,
  scoreLabel,
} from "@/lib/immersion/workflow-score";

/**
 * The "What we found" tab: the problem highlights, read as a stress test.
 * Where the current workflow tab shows where the client is, this one shows
 * what goes wrong when it is pushed: a key person leaves, demand surges,
 * records are lost. That is what the scale readiness score measures, today
 * and once the transformed workflow is in place, beside the workflow health
 * score. What to do about it lives in its own Recommendations tab.
 *
 * Small boxes in a grid, the shared card language of every result tab
 * (components/immersion/report-ui.tsx), so it reads at a glance. Order:
 * scores and key figures, the problems that keep coming back and the
 * pattern behind them, the stress test, then bottlenecks by stage, the same
 * order as the PDF. Evidence
 * sits folded inside each box: the consultant's verification surface, never
 * shown in the client PDF. Findings saved before the stress test existed
 * simply skip those boxes.
 */

const FIX_TONE: Record<FixType, Tone> = {
  ai: "dark",
  automation: "accent",
  system: "azure",
  process: "muted",
};

const OUTCOME_TONE: Record<StressOutcome, Tone> = {
  breaks: "amberStrong",
  strains: "amber",
  holds: "accent",
};

export function FixPill({ type }: { type: FixType | null | undefined }) {
  if (!type) return null;
  return <Pill tone={FIX_TONE[type]}>{FIX_TYPE_LABEL[type]}</Pill>;
}

function ScoreBox({
  label,
  score,
  after,
  rule,
  dark,
}: {
  label: string;
  score: number;
  after?: number | null;
  rule: string;
  dark?: boolean;
}) {
  return (
    <div
      style={{
        ...card,
        backgroundColor: dark ? colors.primary : colors.tertiary,
        borderColor: dark ? colors.primary : colors.tertiary,
        color: dark ? colors.background : colors.primary,
      }}
    >
      <p style={{ ...eyebrow, color: dark ? colors.secondary : colors.accent }}>{label}</p>
      <p style={{ ...heading, fontSize: "32px", lineHeight: 1.1, marginTop: "10px", color: "inherit" }}>
        {score}
        <span style={{ fontSize: "14px", opacity: 0.55 }}>/100</span>
      </p>
      <p style={{ margin: "2px 0 0", fontSize: "12px", fontWeight: 700 }}>{scoreLabel(score)}</p>
      {after !== null && after !== undefined ? (
        <p style={{ margin: "10px 0 0", fontSize: "12px", fontWeight: 700, color: dark ? colors.secondary : colors.accent }}>
          {`→ ${after}/100 (${scoreLabel(after)}) after transformation`}
        </p>
      ) : null}
      <p style={{ margin: "auto 0 0", paddingTop: "10px", fontSize: "10.5px", lineHeight: "14px", opacity: 0.7 }}>{rule}</p>
    </div>
  );
}

export function OpportunityMappingView({
  bottlenecks,
  opportunityMapping,
  diagram,
  afterDiagram,
  departmentName,
}: {
  bottlenecks: Bottleneck[];
  opportunityMapping: OpportunityMapping;
  diagram: WorkflowDiagram;
  afterDiagram?: WorkflowDiagram | null;
  departmentName: string;
}) {
  const findings = opportunityMapping.findings;
  const stress = buildStressViews(findings, afterDiagram);
  const readiness = readinessScores(stress);
  const { score: health } = computeWorkflowScore(bottlenecks.length);
  const stages = buildStageViews(diagram);
  const stageOf = (stepId: string) => stages.find((view) => view.stage.stepIds.includes(stepId));
  const fixByStepId = new Map(bottlenecks.map((b) => [b.stepId, b.fixType]));
  const breaking = stress.filter((v) => v.scenario.outcome === "breaks").length;

  return (
    <ReportShell>
      <ReportHeader
        kicker="Operational assessment"
        title={`What we found: ${departmentName}`}
        subtitle="Where this workflow breaks when it is pushed, the problems that keep coming back, and how ready it is to scale."
        stats={[
          { label: "bottlenecks", value: String(bottlenecks.length) },
          ...(stress.length > 0
            ? [{ label: "scenarios that break it", value: `${breaking} of ${stress.length}` }]
            : []),
          ...(findings ? [{ label: "recurring problems", value: String(findings.themes.length) }] : []),
        ]}
      />

      {!opportunityMapping.categoryMaterialAvailable ? (
        <p
          style={{
            margin: "0 0 20px",
            padding: "10px 12px",
            borderRadius: "10px",
            border: `1px dashed ${wf.stageBorder}`,
            fontSize: "12px",
            color: wf.muted,
          }}
        >
          No Refactrd tools, stack, constraints, or engineering-docs material has been ingested
          yet. Recommendations are grounded in the transcript only.
        </p>
      ) : null}

      <Grid min={170}>
        {readiness.today !== null ? (
          <ScoreBox label="Scale readiness" score={readiness.today} after={readiness.after} rule={SCALE_READINESS_RULE} dark />
        ) : null}
        <ScoreBox
          label="Workflow health"
          score={health}
          rule="100, minus 15 for each bottleneck identified. A plain count, not a measured figure."
        />
        {(findings?.keyFigures ?? []).map((figure, i) => (
          <div key={i} style={{ ...card, backgroundColor: colors.tertiary, borderColor: colors.tertiary }}>
            <p style={{ ...heading, fontSize: "26px", lineHeight: 1.1 }}>{figure.value}</p>
            <p style={{ ...body, color: wf.muted }}>{figure.label}</p>
          </div>
        ))}
      </Grid>

      {findings && findings.themes.length > 0 ? (
        <Section kicker="Problem highlights" title="What keeps coming back">
          <Grid min={230}>
            {findings.themes.map((theme, i) => {
              const fixes = [
                ...new Set(theme.stepIds.map((id) => fixByStepId.get(id)).filter((f): f is FixType => !!f)),
              ];
              return (
                <div key={i} style={card}>
                  <NumberBadge n={i + 1} />
                  <p style={{ ...heading, fontSize: "14.5px", marginTop: "12px" }}>{theme.title}</p>
                  <p style={{ ...body, color: wf.muted }}>{theme.description}</p>
                  {fixes.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "auto", paddingTop: "12px" }}>
                      {fixes.map((fix) => (
                        <FixPill key={fix} type={fix} />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </Grid>
          {findings.pattern ? (
            <div
              style={{
                marginTop: "14px",
                backgroundColor: colors.tertiary,
                borderRadius: "12px",
                padding: "14px 16px",
                fontSize: "13px",
                lineHeight: "20px",
              }}
            >
              <strong>{findings.themes.length > 1 ? "The pattern behind all of these. " : "The pattern. "}</strong>
              {findings.pattern}
            </div>
          ) : null}
        </Section>
      ) : null}

      {stress.length > 0 ? (
        <Section
          kicker="Stress test"
          title="What happens under pressure"
          note="Each scenario tests a weakness the interview described. Today on top, after transformation below."
        >
          <Grid min={230}>
            {stress.map(({ scenario, after }) => {
              const hit = [...new Set(scenario.stepIds.map((id) => stageOf(id)?.stage.title).filter(Boolean))];
              return (
                <div key={scenario.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
                  <div style={{ padding: "16px", backgroundColor: wf.bottleneckFill, flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "6px", alignItems: "center" }}>
                      <p style={{ ...eyebrow, color: wf.bottleneckLabel }}>{STRESS_KIND_LABEL[scenario.kind]}</p>
                      <Pill tone={OUTCOME_TONE[scenario.outcome]}>{OUTCOME_LABEL[scenario.outcome]}</Pill>
                    </div>
                    <p style={{ ...heading, fontSize: "14.5px", marginTop: "10px" }}>{scenario.title}</p>
                    <p style={{ ...body, color: wf.bottleneckInk }}>{scenario.impact}</p>
                    {hit.length > 0 ? (
                      <p style={{ margin: "10px 0 0", fontSize: "11px", fontWeight: 700, color: wf.bottleneckLabel }}>
                        {`Hits: ${hit.join(", ")}`}
                      </p>
                    ) : null}
                    <Folded label="Evidence">{scenario.evidence}</Folded>
                  </div>
                  {after ? (
                    <div style={{ padding: "14px 16px", backgroundColor: wf.opportunityFill, borderTop: `1px solid ${wf.stageBorder}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "6px", alignItems: "center" }}>
                        <p style={{ ...eyebrow, color: colors.accent }}>After transformation</p>
                        <Pill tone={OUTCOME_TONE[after.outcome]}>{OUTCOME_LABEL[after.outcome]}</Pill>
                      </div>
                      {after.how ? <p style={body}>{after.how}</p> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </Grid>
        </Section>
      ) : null}

      <Section kicker="Where it breaks down" title={`Bottlenecks by stage (${bottlenecks.length})`}>
        <Grid min={220}>
          {bottlenecks.map((bottleneck, i) => {
            const view = stageOf(bottleneck.stepId);
            return (
              <div
                key={i}
                style={{
                  ...card,
                  backgroundColor: wf.bottleneckFill,
                  borderColor: wf.bottleneckFill,
                  borderLeft: `4px solid ${wf.bottleneckEdge}`,
                }}
              >
                <p style={{ ...eyebrow, color: wf.bottleneckLabel }}>
                  {view ? `Stage ${String(view.number).padStart(2, "0")} · ${view.stage.title}` : "Bottleneck"}
                </p>
                <p style={{ ...body, color: wf.bottleneckInk }}>{bottleneck.description}</p>
                <div style={{ marginTop: "auto", paddingTop: "10px" }}>
                  <FixPill type={bottleneck.fixType} />
                  <Folded label="Evidence">{bottleneck.evidence}</Folded>
                </div>
              </div>
            );
          })}
        </Grid>
      </Section>
    </ReportShell>
  );
}

export default OpportunityMappingView;
