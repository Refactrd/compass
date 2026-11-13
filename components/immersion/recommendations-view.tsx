import { FixPill } from "@/components/immersion/opportunity-mapping-view";
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
import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import type { Level, OpportunityMapping, Solution } from "@/lib/immersion/opportunity-mapping";
import { buildRoadmap } from "@/lib/immersion/roadmap";
import { buildStageViews, LEVEL_LABEL, TIMELINE_BY_TIER } from "@/lib/immersion/stage-view";

/**
 * The Recommendations tab: what we propose to build, ranked from priority to
 * nice to have, then laid out as the 90 day transformation roadmap
 * (Stabilise, Streamline, Scale). Split out of What we found so that tab is
 * purely the diagnosis and this one is purely the plan.
 *
 * Ranking and phasing both come from each build's tier, which Opportunity
 * Mapping assigns with dependencies in mind (lib/immersion/roadmap.ts), so
 * the ranked list and the roadmap can never disagree. Priority builds show
 * their full rationale open, per CLAUDE.md's "highest priority with full
 * rationale"; the rest keep it folded. Grounding stays folded on every card:
 * the consultant's check, not something the client sees in the PDF.
 */

const TIERS: { tier: Solution["tier"]; label: string; note: string; tone: Tone }[] = [
  { tier: "priority", label: "Priority", note: "The biggest, best-grounded impact. Build these first.", tone: "dark" },
  { tier: "recommended", label: "Recommended", note: "Solid next moves once the priorities are live.", tone: "azure" },
  { tier: "nice-to-have", label: "Nice to have", note: "Smaller wins to add as the core settles.", tone: "muted" },
];

const LEVEL_TONE: Record<Level, Tone> = { high: "dark", medium: "azure", low: "muted" };

const PHASE_HEADER: React.CSSProperties[] = [
  { backgroundColor: colors.primary, color: colors.background },
  { backgroundColor: colors.secondary, color: colors.primary },
  { backgroundColor: colors.tertiary, color: colors.primary },
];

export function RecommendationsView({
  opportunityMapping,
  diagram,
  afterDiagram,
  departmentName,
}: {
  opportunityMapping: OpportunityMapping;
  diagram: WorkflowDiagram;
  afterDiagram?: WorkflowDiagram | null;
  departmentName: string;
}) {
  const solutions = opportunityMapping.solutions;
  const rankOf = new Map(solutions.map((solution, i) => [solution, i + 1]));
  const stages = buildStageViews(diagram);
  const stageTitlesFor = (solution: Solution) => [
    ...new Set(
      solution.addressesBottleneckStepIds
        .map((id) => stages.find((view) => view.stage.stepIds.includes(id))?.stage.title)
        .filter((title): title is string => !!title),
    ),
  ];
  const afterStages = afterDiagram ? buildStageViews(afterDiagram) : [];
  const transformedBy = (titles: string[]) =>
    afterStages
      .filter((view) => view.stage.builds?.some((build) => titles.includes(build)))
      .map((view) => view.stage.title);
  const roadmap = buildRoadmap(solutions);

  return (
    <ReportShell>
      <ReportHeader
        kicker="What we recommend"
        title={`Recommendations: ${departmentName}`}
        subtitle="The builds we propose, ranked from priority to nice to have, then sequenced into a 90 day transformation roadmap. Impact and effort are Refactrd's estimates, tightened during scoping."
        stats={TIERS.map(({ tier, label }) => ({
          label: label.toLowerCase(),
          value: String(solutions.filter((s) => s.tier === tier).length),
        }))}
      />

      {solutions.length === 0 ? (
        <p style={{ ...body, color: wf.muted }}>No builds could be grounded from the material available.</p>
      ) : null}

      {TIERS.map(({ tier, label, note, tone }) => {
        const inTier = solutions.filter((s) => s.tier === tier);
        if (inTier.length === 0) return null;
        return (
          <section key={tier} style={{ marginTop: "28px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
              <Pill tone={tone}>{`${label} · ${TIMELINE_BY_TIER[tier]}`}</Pill>
              <span style={{ fontSize: "12.5px", color: wf.muted }}>{note}</span>
            </div>
            <Grid min={250}>
              {inTier.map((solution) => {
                const fixes = stageTitlesFor(solution);
                const why = (
                  <>
                    <p style={{ margin: 0 }}>{solution.rationale}</p>
                    {solution.timeSavedEstimate ? (
                      <p style={{ margin: "6px 0 0", fontWeight: 700, color: colors.accent }}>
                        {`Estimated time saved: ${solution.timeSavedEstimate}`}
                      </p>
                    ) : (
                      <p style={{ margin: "6px 0 0", fontSize: "11px", color: wf.muted }}>
                        No time-saved figure: the transcript and retrieved material do not support one.
                      </p>
                    )}
                  </>
                );
                return (
                  <div
                    key={solution.title}
                    style={{ ...card, borderTop: tier === "priority" ? `3px solid ${colors.primary}` : card.border }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                      <NumberBadge n={rankOf.get(solution) ?? 0} tone={tier === "priority" ? "dark" : "azure"} />
                      <FixPill type={solution.kind} />
                    </div>
                    <p style={{ ...heading, fontSize: "15px", marginTop: "12px" }}>{solution.title}</p>
                    {solution.summary ? <p style={body}>{solution.summary}</p> : null}
                    {solution.replaces ? (
                      <p style={{ ...body, fontSize: "12px", lineHeight: "17px", color: wf.muted }}>
                        <strong style={{ color: colors.accent }}>Replaces: </strong>
                        {solution.replaces}
                      </p>
                    ) : null}
                    {fixes.length > 0 ? (
                      <p style={{ ...body, fontSize: "11.5px", lineHeight: "16px", color: wf.muted }}>
                        <strong style={{ color: colors.accent }}>Fixes: </strong>
                        {fixes.join(", ")}
                      </p>
                    ) : null}
                    {tier === "priority" ? (
                      <div
                        style={{
                          marginTop: "12px",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          backgroundColor: colors.tertiary,
                          fontSize: "12px",
                          lineHeight: "17px",
                        }}
                      >
                        <p style={{ ...eyebrow, fontSize: "9.5px", color: colors.accent, marginBottom: "4px" }}>Why this first</p>
                        {why}
                      </div>
                    ) : null}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "auto", paddingTop: "14px" }}>
                      {solution.impact ? (
                        <Pill tone={LEVEL_TONE[solution.impact]}>{`${LEVEL_LABEL[solution.impact]} impact`}</Pill>
                      ) : null}
                      {solution.effort ? (
                        <Pill tone={LEVEL_TONE[solution.effort]}>{`${LEVEL_LABEL[solution.effort]} effort`}</Pill>
                      ) : null}
                    </div>
                    {tier !== "priority" ? <Folded label="Why">{why}</Folded> : null}
                    <Folded label="Grounded in">
                      <ul style={{ margin: 0, paddingLeft: "16px" }}>
                        {solution.groundedIn.map((ground, j) => (
                          <li key={j}>{`${ground.source === "transcript" ? "Transcript" : "Document"}: ${ground.detail}`}</li>
                        ))}
                      </ul>
                    </Folded>
                  </div>
                );
              })}
            </Grid>
          </section>
        );
      })}

      {solutions.length > 0 ? (
        <Section
          kicker="90 day transformation roadmap"
          title="What we build, and when"
          note="Anything another build depends on comes first."
        >
          <div style={{ display: "flex", gap: "4px", marginBottom: "6px" }} aria-hidden="true">
            {PHASE_HEADER.map((style, i) => (
              <div key={i} style={{ flex: 1, height: "6px", borderRadius: "999px", backgroundColor: style.backgroundColor }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5px", color: wf.muted, marginBottom: "14px" }}>
            <span>Day 1</span>
            <span>Day 30</span>
            <span>Day 60</span>
            <span>Day 90</span>
          </div>
          <Grid min={240}>
            {roadmap.phases.map((phase, i) => {
              const transforms = transformedBy(phase.solutions.map((s) => s.title));
              return (
                <div key={phase.label} style={{ ...card, padding: "12px" }}>
                  <div style={{ ...PHASE_HEADER[i], borderRadius: "8px", padding: "12px 14px" }}>
                    <p style={{ ...eyebrow, color: "inherit", opacity: 0.85 }}>{phase.rangeDays}</p>
                    <p style={{ ...heading, color: "inherit", fontSize: "18px", marginTop: "4px" }}>{phase.label}</p>
                    <p style={{ margin: "2px 0 0", fontSize: "12px", opacity: 0.85 }}>{phase.aim}</p>
                  </div>
                  <div style={{ padding: "4px 4px 0" }}>
                    {phase.solutions.length === 0 ? (
                      <p style={{ ...body, color: wf.muted }}>Nothing scheduled in this phase.</p>
                    ) : (
                      phase.solutions.map((solution) => (
                        <div
                          key={solution.title}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "10px 0",
                            borderBottom: `1px solid ${colors.tertiary}`,
                          }}
                        >
                          <NumberBadge n={rankOf.get(solution) ?? 0} tone={i === 0 ? "dark" : "azure"} />
                          <span style={{ flex: 1, fontSize: "13px", fontWeight: 600 }}>{solution.title}</span>
                          <FixPill type={solution.kind} />
                        </div>
                      ))
                    )}
                    {transforms.length > 0 ? (
                      <p style={{ ...body, fontSize: "11.5px", lineHeight: "16px", color: wf.muted, marginTop: "10px" }}>
                        <strong style={{ color: colors.accent }}>Transforms: </strong>
                        {transforms.join(", ")}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </Grid>
        </Section>
      ) : null}
    </ReportShell>
  );
}

export default RecommendationsView;
