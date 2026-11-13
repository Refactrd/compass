import path from "node:path";

import { Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { refactrdBrand } from "@/brand/token";
import type { Bottleneck, Findings, FixType } from "@/lib/immersion/bottleneck-extraction";
import type { StressOutcome, WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import type { Level, OpportunityMapping, Solution } from "@/lib/immersion/opportunity-mapping";
import { buildRoadmap } from "@/lib/immersion/roadmap";
import {
  buildStageViews,
  buildStressViews,
  chunk,
  FIX_TYPE_LABEL,
  LEVEL_LABEL,
  OUTCOME_LABEL,
  readinessScores,
  STRESS_KIND_LABEL,
  stageTag,
  TIMELINE_BY_TIER,
} from "@/lib/immersion/stage-view";
import {
  computeWorkflowScore,
  SCALE_READINESS_RULE,
  scoreLabel,
} from "@/lib/immersion/workflow-score";

/**
 * Shared building blocks for every Phase 2 PDF (the department Opportunity
 * Mapping PDF and the Comprehensive Report): Refactrd's real brand tokens,
 * the shared style sheet, and the section templates, so both documents stay
 * visually identical rather than drifting into two designs.
 *
 * The PDF mirrors the department result tabs section for section, in the
 * same order and with the same header stats and card language
 * (components/immersion/report-ui.tsx and the views beside it): current
 * workflow, what we found, transformed workflow, recommendations with the 90
 * day roadmap. departmentSections() is the one place that order lives, used
 * by both documents. Landscape A4 and the dark cover come from the approved
 * SA Logistics findings report.
 *
 * Each section is one flowing page: the top bar and footer repeat on every
 * printed page, rows of cards never split across a page break, and section
 * headings never sit alone at the bottom of a page.
 *
 * See department-pdf.tsx for react-pdf as the renderer.
 *
 * Real Refactrd typography, registered from local files rather than left on
 * react-pdf's built-in Helvetica: Poppins for headings (the brand
 * guideline's own documented fallback for Codec Pro, which is licensed and
 * not available here) and Montserrat for everything else, which is how
 * brand/token.ts already names them. @fontsource ships both .woff2 and
 * .woff per weight; .woff2 is registered here first but throws
 * `RangeError: Offset is outside the bounds of the DataView` from inside
 * react-pdf's PDF writer the moment a real page tries to embed/subset it
 * (caught live, not assumed: generating an actual department PDF against a
 * .woff2 registration crashed the request). fontkit's WOFF2 decompression
 * has known gaps for exactly this failure signature; plain .woff is the
 * simpler, non-brotli format and embeds cleanly, confirmed by rendering a
 * real PDF and reading Poppins/Montserrat back out of its font resources.
 */

const FONT_DIR = path.join(process.cwd(), "node_modules");

Font.register({
  family: "Poppins",
  fonts: [
    {
      src: path.join(FONT_DIR, "@fontsource/poppins/files/poppins-latin-400-normal.woff"),
      fontWeight: 400,
    },
    {
      src: path.join(FONT_DIR, "@fontsource/poppins/files/poppins-latin-700-normal.woff"),
      fontWeight: 700,
    },
  ],
});

Font.register({
  family: "Montserrat",
  fonts: [
    {
      src: path.join(FONT_DIR, "@fontsource/montserrat/files/montserrat-latin-400-normal.woff"),
      fontWeight: 400,
    },
    {
      src: path.join(FONT_DIR, "@fontsource/montserrat/files/montserrat-latin-700-normal.woff"),
      fontWeight: 700,
    },
  ],
});

// No automatic hyphenation: react-pdf otherwise splits words across lines
// ("mes-sages"), which the reference report never does.
Font.registerHyphenationCallback((word) => [word]);


export const { colors } = refactrdBrand;
const wf = colors.workflow;

const LOGO_PATH = path.join(process.cwd(), "brand", "logo-light-bg.png");
const LOGO_DARK_PATH = path.join(process.cwd(), "brand", "logo-dark-bg.png");

const GAP = 12;

export const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingBottom: 50,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: "Montserrat",
    color: colors.primary,
    backgroundColor: colors.background,
  },
  coverPage: {
    paddingVertical: 48,
    paddingHorizontal: 56,
    fontFamily: "Montserrat",
    color: colors.background,
    backgroundColor: colors.primary,
  },
  coverTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  coverLogo: { width: 110 },
  coverLabel: { fontSize: 8, fontWeight: 700, letterSpacing: 1.8, color: colors.secondary },
  coverBody: { flexGrow: 1, justifyContent: "center" },
  coverRule: { width: 48, height: 3, backgroundColor: colors.secondary, marginBottom: 18 },
  coverTitle: { fontSize: 40, fontFamily: "Poppins", fontWeight: 700, color: colors.secondary },
  coverSubtitle: { fontSize: 24, fontFamily: "Poppins", fontWeight: 700, marginTop: 6 },
  coverLead: { fontSize: 11, lineHeight: 1.5, marginTop: 14, maxWidth: 420, opacity: 0.85 },
  coverFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#3a4766",
    paddingTop: 12,
    fontSize: 8,
    color: colors.secondary,
  },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  logo: { width: 84 },
  topBarLabel: { fontSize: 7, fontWeight: 700, letterSpacing: 1.6, color: colors.accent },
  header: { borderBottomWidth: 1, borderBottomColor: wf.stageBorder, paddingBottom: 12, marginBottom: 16 },
  eyebrow: { fontSize: 6.5, fontWeight: 700, letterSpacing: 1.2 },
  kicker: { fontSize: 7, fontWeight: 700, letterSpacing: 1.4, color: colors.accent },
  h1: { fontSize: 20, fontFamily: "Poppins", fontWeight: 700, marginTop: 3 },
  subtitle: { fontSize: 9, lineHeight: 1.4, color: wf.muted, marginTop: 3, maxWidth: 560 },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  stat: { backgroundColor: colors.tertiary, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, minWidth: 74 },
  statValue: { fontSize: 13, fontFamily: "Poppins", fontWeight: 700 },
  statLabel: { fontSize: 7, color: wf.muted, marginTop: 1 },
  legendRow: { flexDirection: "row", marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", marginRight: 14 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2, marginRight: 5 },
  legendText: { fontSize: 7, color: wf.muted },
  sectionHead: { marginTop: 16, marginBottom: 8 },
  h2: { fontSize: 13, fontFamily: "Poppins", fontWeight: 700, marginTop: 2 },
  note: { fontSize: 8, color: wf.muted, marginTop: 2 },
  row: { flexDirection: "row", gap: GAP, marginBottom: GAP },
  // flexGrow only, never flexBasis 0: cards sit in a column-direction cell,
  // where a zero basis collapses their height to nothing and stacks the text.
  card: {
    flexGrow: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: wf.stageBorder,
    backgroundColor: "#ffffff",
    padding: 11,
  },
  cardTitle: { fontSize: 11.5, fontFamily: "Poppins", fontWeight: 700, marginTop: 4 },
  cardText: { fontSize: 8.2, lineHeight: 1.4, marginTop: 4 },
  small: { fontSize: 7.2, lineHeight: 1.35, marginTop: 4 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 8 },
  pill: { fontSize: 6.5, fontWeight: 700, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6 },
  chip: { fontSize: 7.2, fontWeight: 700, paddingVertical: 2, paddingHorizontal: 5, borderRadius: 4 },
  spacer: { flexGrow: 1 },
  rule: { borderTopWidth: 1, marginTop: 10, paddingTop: 7 },
  inset: { marginTop: 8, borderLeftWidth: 2, borderRadius: 4, paddingVertical: 5, paddingHorizontal: 7 },
  bigNumber: { fontSize: 22, fontFamily: "Poppins", fontWeight: 700, marginTop: 4 },
  numberBadge: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  numberText: { fontSize: 6.8, fontWeight: 700 },
  callout: { backgroundColor: colors.tertiary, borderRadius: 8, padding: 10, marginBottom: GAP },
  tableRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: wf.stageBorder,
    alignItems: "flex-start",
  },
  empty: { fontSize: 9, color: wf.muted },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7, color: wf.muted },
});

type PillStyle = { backgroundColor: string; color: string };

const TONE = {
  dark: { backgroundColor: colors.primary, color: colors.background },
  accent: { backgroundColor: colors.accent, color: colors.background },
  azure: { backgroundColor: wf.opportunityFill, color: colors.accent },
  amber: { backgroundColor: wf.bottleneckFill, color: wf.bottleneckLabel },
  amberStrong: { backgroundColor: wf.breaks, color: colors.background },
  muted: { backgroundColor: colors.tertiary, color: colors.primary },
} satisfies Record<string, PillStyle>;

const FIX_TONE: Record<FixType, PillStyle> = {
  ai: TONE.dark,
  automation: TONE.accent,
  system: TONE.azure,
  process: TONE.muted,
};
const LEVEL_TONE: Record<Level, PillStyle> = { high: TONE.dark, medium: TONE.azure, low: TONE.muted };
const OUTCOME_TONE: Record<StressOutcome, PillStyle> = {
  breaks: TONE.amberStrong,
  strains: { backgroundColor: wf.bottleneckEdge, color: colors.primary },
  holds: TONE.accent,
};

function Pill({ tone, text }: { tone: PillStyle; text: string }) {
  return <Text style={[pdfStyles.pill, tone]}>{text}</Text>;
}

function Eyebrow({ text, color }: { text: string; color: string }) {
  return <Text style={[pdfStyles.eyebrow, { color }]}>{text.toUpperCase()}</Text>;
}

function NumberBadge({ n, dark }: { n: number; dark?: boolean }) {
  return (
    <View style={[pdfStyles.numberBadge, { backgroundColor: dark ? colors.primary : colors.secondary }]}>
      <Text style={[pdfStyles.numberText, { color: dark ? colors.background : colors.primary }]}>
        {String(n).padStart(2, "0")}
      </Text>
    </View>
  );
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Print-only trimming: the first sentence or two of `text`, up to `max`
 * characters, cut at a sentence end where possible and a word boundary
 * otherwise. The full text stays in the on-screen tabs; the PDF keeps
 * every card short enough that a header and its first row of cards always
 * fit on one page, which is what stops blank and half-empty pages.
 */
function brief(text: string | null | undefined, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  let out = "";
  for (const sentence of sentences) {
    if ((out + sentence).trim().length > max) break;
    out += sentence;
  }
  if (out.trim()) return out.trim();
  // A client document should not stop mid-sentence: keep the whole first
  // sentence unless it is far over the limit.
  const first = sentences[0]?.trim();
  if (first && first.length <= max * 1.6) return first;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}

export function ReportFooter({ clientName }: { clientName: string }) {
  return (
    <View style={pdfStyles.footer} fixed>
      <Text style={pdfStyles.footerText}>{`Refactrd · prepared for ${clientName} · confidential`}</Text>
      <Text style={pdfStyles.footerText} render={({ pageNumber }) => `${pageNumber}`} />
    </View>
  );
}

/** Logo and "Business immersion", repeated on every printed page of a
 * flowing section. */
function TopBar() {
  return (
    <View style={pdfStyles.topBar} fixed>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop */}
      <Image src={LOGO_PATH} style={pdfStyles.logo} />
      <Text style={pdfStyles.topBarLabel}>BUSINESS IMMERSION</Text>
    </View>
  );
}

export function CoverPage({
  label,
  title,
  subtitle,
  lead,
  clientName,
  date,
}: {
  label: string;
  title: string;
  subtitle: string;
  lead: string;
  clientName: string;
  date: string;
}) {
  return (
    <Page size="A4" orientation="landscape" style={pdfStyles.coverPage}>
      <View style={pdfStyles.coverTop}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop */}
        <Image src={LOGO_DARK_PATH} style={pdfStyles.coverLogo} />
        <Text style={pdfStyles.coverLabel}>{label}</Text>
      </View>
      <View style={pdfStyles.coverBody}>
        <View style={pdfStyles.coverRule} />
        <Text style={pdfStyles.coverTitle}>{title}</Text>
        <Text style={pdfStyles.coverSubtitle}>{subtitle}</Text>
        <Text style={pdfStyles.coverLead}>{lead}</Text>
      </View>
      <View style={pdfStyles.coverFooter}>
        <Text>{`Prepared for ${clientName}`}</Text>
        <Text>{date}</Text>
        <Text>Confidential</Text>
      </View>
    </Page>
  );
}

type Stat = { label: string; value: string };
type Legend = { swatch: Record<string, string | number>; label: string }[];

/** The same header every tab opens with: eyebrow, title, one-line
 * subtitle, headline stats, legend, closed by a rule. */
export function SectionHeader({
  kicker,
  title,
  subtitle,
  stats = [],
  legend = [],
}: {
  kicker: string;
  title: string;
  subtitle: string;
  stats?: Stat[];
  legend?: Legend;
}) {
  return (
    <View style={pdfStyles.header}>
      <Text style={pdfStyles.kicker}>{kicker.toUpperCase()}</Text>
      <Text style={pdfStyles.h1}>{title}</Text>
      <Text style={pdfStyles.subtitle}>{subtitle}</Text>
      {stats.length > 0 ? (
        <View style={pdfStyles.statsRow}>
          {stats.map((stat) => (
            <View key={stat.label} style={pdfStyles.stat}>
              <Text style={pdfStyles.statValue}>{stat.value}</Text>
              <Text style={pdfStyles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {legend.length > 0 ? (
        <View style={pdfStyles.legendRow}>
          {legend.map((item) => (
            <View key={item.label} style={pdfStyles.legendItem}>
              <View style={[pdfStyles.legendSwatch, item.swatch]} />
              <Text style={pdfStyles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SubHeading({ kicker, title, note }: { kicker: string; title: string; note?: string }) {
  return (
    <View style={pdfStyles.sectionHead}>
      <Text style={pdfStyles.kicker}>{kicker.toUpperCase()}</Text>
      <Text style={pdfStyles.h2}>{title}</Text>
      {note ? <Text style={pdfStyles.note}>{note}</Text> : null}
    </View>
  );
}

/** Cards in rows of `columns`, each row kept whole across page breaks and
 * padded so the last row's cards keep the same width. `lead` (a section or
 * tier heading) is bound to the first row, so a heading can never be left
 * alone at the foot of a page with its cards on the next. */
function CardRows<T>({
  items,
  columns,
  keyPrefix,
  cell,
  lead,
  rowGap = GAP,
}: {
  items: T[];
  columns: number;
  keyPrefix: string;
  cell: (item: T, index: number) => React.ReactNode;
  lead?: React.ReactNode;
  rowGap?: number;
}) {
  return (
    <>
      {chunk(items, columns).map((row, r) => (
        <View key={`${keyPrefix}-${r}`} wrap={false}>
          {r === 0 ? lead : null}
          <View style={[pdfStyles.row, { marginBottom: rowGap }]}>
          {row.map((item, c) => (
            <View key={`${keyPrefix}-${r}-${c}`} style={{ flexGrow: 1, flexBasis: 0, flexDirection: "column" }}>
              {cell(item, r * columns + c)}
            </View>
          ))}
          {Array.from({ length: columns - row.length }, (_, i) => (
            <View key={`${keyPrefix}-${r}-pad-${i}`} style={{ flexGrow: 1, flexBasis: 0 }} />
          ))}
          </View>
        </View>
      ))}
    </>
  );
}

export function SectionPage({ clientName, children }: { clientName: string; children: React.ReactNode }) {
  return (
    <Page size="A4" orientation="landscape" style={pdfStyles.page} wrap>
      <TopBar />
      {children}
      <ReportFooter clientName={clientName} />
    </Page>
  );
}

/** Everything one department's sections need, from its saved row. */
export type DepartmentReportData = {
  departmentName: string;
  beforeDiagram: WorkflowDiagram;
  afterDiagram: WorkflowDiagram;
  bottlenecks: Bottleneck[];
  opportunityMapping: OpportunityMapping;
};

/**
 * One department's pages, in the same order as its result tabs: current
 * workflow, what we found, transformed workflow, recommendations. Keys carry
 * `keyPrefix`: the Comprehensive Report renders several departments into one
 * document, and react-pdf has been observed duplicating text when sibling
 * elements across sections share keys, so every key must be unique
 * document-wide.
 */
export function departmentSections(
  data: DepartmentReportData,
  { clientName, keyPrefix }: { clientName: string; keyPrefix: string },
) {
  return [
    // The current workflow is the part the client already knows, so it is a
    // compact block of stage titles that opens the same flowing page as What
    // we found, rather than taking pages of its own.
    <SectionPage key={`${keyPrefix}-current`} clientName={clientName}>
      <CurrentWorkflowBlock {...data} clientName={clientName} keyPrefix={`${keyPrefix}-current`} />
      <View style={{ height: 14 }} />
      <FindingsBlock {...data} clientName={clientName} keyPrefix={`${keyPrefix}-found`} />
    </SectionPage>,
    <TransformedSection key={`${keyPrefix}-after`} {...data} clientName={clientName} keyPrefix={`${keyPrefix}-after`} />,
    <RecommendationsSection key={`${keyPrefix}-recs`} {...data} clientName={clientName} keyPrefix={`${keyPrefix}-recs`} />,
  ];
}

type SectionProps = DepartmentReportData & { clientName: string; keyPrefix: string };

/* 1. Current workflow: in print, a vertical numbered flow, 01 down to the
 * last stage, in two or three columns read top to bottom. Each stage is its
 * title only, marked where it has a bottleneck. The client already knows
 * how their work runs today; summaries and step ranges stay on screen. */
function CurrentWorkflowBlock({
  departmentName,
  beforeDiagram,
  bottlenecks,
  opportunityMapping,
  keyPrefix,
}: SectionProps) {
  const views = buildStageViews(beforeDiagram, bottlenecks, opportunityMapping);
  const flagged = views.filter((view) => view.bottlenecks.length > 0).length;
  const columnCount = views.length <= 10 ? 2 : 3;
  const perColumn = Math.ceil(views.length / columnCount);
  const columns = chunk(views, perColumn);

  return (
    <View wrap={views.length > 36}>
      <SectionHeader
        kicker="Where you are today"
        title={`Current workflow: ${departmentName}`}
        subtitle="How the work runs today, in order. Stages marked in amber have a bottleneck, set out in What we found."
        stats={[
          { label: "steps today", value: String(beforeDiagram.steps.length) },
          { label: "stages", value: String(views.length) },
          { label: "stages with a bottleneck", value: `${flagged} of ${views.length}` },
        ]}
        legend={[
          { swatch: { backgroundColor: colors.primary, borderRadius: 4 }, label: "Stage" },
          { swatch: { backgroundColor: wf.bottleneckEdge, borderRadius: 4 }, label: "Has a bottleneck" },
        ]}
      />
      {views.length === 0 ? <Text style={pdfStyles.empty}>No workflow extracted.</Text> : null}
      <View style={{ flexDirection: "row", gap: 24 }}>
        {columns.map((column, c) => (
          <View key={`${keyPrefix}-col-${c}`} style={{ flexGrow: 1, flexBasis: 0 }}>
            {column.map((view, i) => {
              const hasBottleneck = view.bottlenecks.length > 0;
              const lastOverall = view.number === views.length;
              const lastInColumn = i === column.length - 1;
              return (
                <View key={`${keyPrefix}-${view.stage.id}`} style={{ flexDirection: "row" }}>
                  <View style={{ width: 22, alignItems: "center" }}>
                    <View
                      style={[
                        pdfStyles.numberBadge,
                        { backgroundColor: hasBottleneck ? wf.bottleneckEdge : colors.primary },
                      ]}
                    >
                      <Text style={[pdfStyles.numberText, { color: colors.background }]}>{pad2(view.number)}</Text>
                    </View>
                    {lastOverall ? null : (
                      <View
                        style={{
                          flexGrow: 1,
                          width: 1.5,
                          minHeight: 6,
                          backgroundColor: lastInColumn ? "transparent" : wf.stageBorder,
                        }}
                      />
                    )}
                  </View>
                  <View style={{ flexGrow: 1, flexBasis: 0, paddingLeft: 8, paddingTop: 3, paddingBottom: 7 }}>
                    <Text
                      style={{
                        fontSize: 8.8,
                        fontWeight: 700,
                        lineHeight: 1.3,
                        color: hasBottleneck ? wf.bottleneckInk : colors.primary,
                      }}
                    >
                      {view.stage.title}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

/* 2. What we found: scores and key figures, the problems that keep coming
 * back and the pattern behind them, the stress test, bottlenecks by stage. */
function FindingsBlock({
  departmentName,
  beforeDiagram,
  afterDiagram,
  bottlenecks,
  opportunityMapping,
  keyPrefix,
}: SectionProps) {
  const findings: Findings | undefined = opportunityMapping.findings;
  const stress = buildStressViews(findings, afterDiagram);
  const readiness = readinessScores(stress);
  const { score: health } = computeWorkflowScore(bottlenecks.length);
  const stages = buildStageViews(beforeDiagram, bottlenecks, opportunityMapping);
  const stageOf = (stepId: string) => stages.find((view) => view.stage.stepIds.includes(stepId));
  const breaking = stress.filter((v) => v.scenario.outcome === "breaks").length;
  const opportunityFor = (stepId: string) =>
    (opportunityMapping.opportunities ?? []).find((o) => o.stepId === stepId)?.text ?? null;

  type Tile =
    | { kind: "score"; label: string; score: number; after: number | null; dark: boolean }
    | { kind: "figure"; value: string; label: string };
  const tiles: Tile[] = [
    ...(readiness.today !== null
      ? [{ kind: "score" as const, label: "Scale readiness", score: readiness.today, after: readiness.after, dark: true }]
      : []),
    { kind: "score", label: "Workflow health", score: health, after: null, dark: false },
    ...(findings?.keyFigures ?? []).map((f) => ({ kind: "figure" as const, value: f.value, label: f.label })),
  ];

  return (
    <>

      <CardRows
        lead={
          <SectionHeader
            kicker="Operational assessment"
            title={`What we found: ${departmentName}`}
            subtitle="Where this workflow breaks when it is pushed, the problems that keep coming back, and how ready it is to scale."
            stats={[
              { label: "bottlenecks", value: String(bottlenecks.length) },
              ...(stress.length > 0 ? [{ label: "scenarios that break it", value: `${breaking} of ${stress.length}` }] : []),
              ...(findings ? [{ label: "recurring problems", value: String(findings.themes.length) }] : []),
            ]}
          />
        }
        items={tiles}
        columns={Math.max(4, Math.min(tiles.length, 6))}
        keyPrefix={`${keyPrefix}-tiles`}
        cell={(tile) =>
          tile.kind === "score" ? (
            <View
              style={[
                pdfStyles.card,
                {
                  backgroundColor: tile.dark ? colors.primary : colors.tertiary,
                  borderColor: tile.dark ? colors.primary : colors.tertiary,
                },
              ]}
            >
              <Eyebrow text={tile.label} color={tile.dark ? colors.secondary : colors.accent} />
              <Text style={[pdfStyles.bigNumber, { color: tile.dark ? colors.background : colors.primary }]}>
                {`${tile.score}/100`}
              </Text>
              <Text style={[pdfStyles.small, { fontWeight: 700, color: tile.dark ? colors.background : colors.primary }]}>
                {scoreLabel(tile.score)}
              </Text>
              {tile.after !== null ? (
                <Text style={[pdfStyles.small, { fontWeight: 700, color: colors.secondary }]}>
                  {`Rises to ${tile.after}/100 (${scoreLabel(tile.after)}) after transformation`}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={[pdfStyles.card, { backgroundColor: colors.tertiary, borderColor: colors.tertiary }]}>
              <Text style={[pdfStyles.bigNumber, { fontSize: 17 }]}>{tile.value}</Text>
              <Text style={[pdfStyles.small, { color: wf.muted }]}>{tile.label}</Text>
            </View>
          )
        }
      />
      <Text style={[pdfStyles.small, { color: wf.muted, marginTop: -6, marginBottom: 4 }]}>
        {`Scale readiness: ${SCALE_READINESS_RULE} Workflow health: 100, minus 15 for each bottleneck identified. Both are plain counts, not measured figures.`}
      </Text>

      {findings && findings.themes.length > 0 ? (
        <>
          <CardRows
            lead={<SubHeading kicker="Problem highlights" title="What keeps coming back" />}
            items={findings.themes}
            columns={4}
            keyPrefix={`${keyPrefix}-themes`}
            cell={(theme, i) => (
              <View style={pdfStyles.card}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <NumberBadge n={i + 1} />
                  <Text style={[pdfStyles.cardTitle, { fontSize: 10, marginTop: 0, flexGrow: 1, flexBasis: 0 }]}>
                    {theme.title}
                  </Text>
                </View>
                <Text style={[pdfStyles.cardText, { color: wf.muted }]}>{brief(theme.description, 140)}</Text>
              </View>
            )}
          />
          {findings.pattern ? (
            <View style={pdfStyles.callout} wrap={false}>
              <Text style={{ fontSize: 8.5, fontWeight: 700 }}>
                {findings.themes.length > 1 ? "The pattern behind all of these." : "The pattern."}
              </Text>
              <Text style={[pdfStyles.cardText, { marginTop: 2 }]}>{findings.pattern}</Text>
            </View>
          ) : null}
        </>
      ) : null}

      {stress.length > 0 ? (
        <>
          <CardRows
            lead={
              <SubHeading
                kicker="Stress test"
                title="What happens under pressure"
                note="Each scenario tests a weakness we heard about during the day. Today on top, after transformation below."
              />
            }
            items={stress}
            columns={4}
            keyPrefix={`${keyPrefix}-stress`}
            cell={({ scenario, after }) => {
              // Stage numbers, not names: a scenario often hits several
              // stages, and their full titles swamped the card.
              const hit = [...new Set(scenario.stepIds.map((id) => stageOf(id)?.number).filter((n): n is number => !!n))]
                .sort((a, b) => a - b)
                .map(pad2);
              return (
                <View style={[pdfStyles.card, { padding: 0, overflow: "hidden" }]}>
                  <View style={{ flexGrow: 1, backgroundColor: wf.bottleneckFill, padding: 10 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Eyebrow text={STRESS_KIND_LABEL[scenario.kind]} color={wf.bottleneckLabel} />
                      <Pill tone={OUTCOME_TONE[scenario.outcome]} text={OUTCOME_LABEL[scenario.outcome]} />
                    </View>
                    <Text style={[pdfStyles.cardTitle, { fontSize: 10.5 }]}>{scenario.title}</Text>
                    <Text style={[pdfStyles.cardText, { color: wf.bottleneckInk }]}>{brief(scenario.impact, 170)}</Text>
                    {hit.length > 0 ? (
                      <Text style={[pdfStyles.small, { fontWeight: 700, color: wf.bottleneckLabel }]}>
                        {`Hits stage${hit.length === 1 ? "" : "s"} ${hit.join(", ")}`}
                      </Text>
                    ) : null}
                  </View>
                  {after ? (
                    <View style={{ backgroundColor: wf.opportunityFill, padding: 10 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Eyebrow text="After transformation" color={colors.accent} />
                        <Pill tone={OUTCOME_TONE[after.outcome]} text={OUTCOME_LABEL[after.outcome]} />
                      </View>
                      {after.how ? <Text style={pdfStyles.cardText}>{brief(after.how, 150)}</Text> : null}
                    </View>
                  ) : null}
                </View>
              );
            }}
          />
        </>
      ) : null}

      {bottlenecks.length > 0 ? (
        <>
          {bottlenecks.map((bottleneck, i) => {
            const view = stageOf(bottleneck.stepId);
            const opportunity = opportunityFor(bottleneck.stepId);
            return (
              <View key={`${keyPrefix}-bn-${i}`} wrap={false}>
                {i === 0 ? (
                  <>
                    <SubHeading kicker="Where it breaks down" title={`Bottlenecks by stage (${bottlenecks.length})`} />
                    <View style={[pdfStyles.tableRow, { borderBottomWidth: 1.5, borderBottomColor: colors.primary, paddingVertical: 4 }]}>
                      <Text style={[pdfStyles.eyebrow, { width: 150, color: colors.accent }]}>STAGE</Text>
                      <Text style={[pdfStyles.eyebrow, { flexGrow: 1.2, flexBasis: 0, color: colors.accent }]}>WHAT BREAKS</Text>
                      <Text style={[pdfStyles.eyebrow, { flexGrow: 1, flexBasis: 0, color: colors.accent }]}>OPPORTUNITY</Text>
                      <Text style={[pdfStyles.eyebrow, { width: 78, color: colors.accent }]}>FIX</Text>
                    </View>
                  </>
                ) : null}
                <View style={pdfStyles.tableRow}>
                  <View style={{ width: 150, flexDirection: "row", gap: 6 }}>
                    <Text style={[pdfStyles.eyebrow, { color: wf.bottleneckLabel, marginTop: 1 }]}>
                      {view ? pad2(view.number) : ""}
                    </Text>
                    <Text style={{ flexGrow: 1, flexBasis: 0, fontSize: 8, fontWeight: 700 }}>{view?.stage.title ?? ""}</Text>
                  </View>
                  <Text style={[pdfStyles.small, { marginTop: 0, flexGrow: 1.2, flexBasis: 0, color: wf.bottleneckInk }]}>
                    {brief(bottleneck.description, 210)}
                  </Text>
                  <Text style={[pdfStyles.small, { marginTop: 0, flexGrow: 1, flexBasis: 0, color: colors.accent }]}>
                    {brief(opportunity, 170)}
                  </Text>
                  <View style={{ width: 78 }}>
                    {bottleneck.fixType ? (
                      <Pill tone={FIX_TONE[bottleneck.fixType]} text={FIX_TYPE_LABEL[bottleneck.fixType]} />
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
        </>
      ) : null}
    </>
  );
}

/* 3. Transformed workflow: machines take the repetitive work, people keep
 * the critical decisions. */
function TransformedSection({
  departmentName,
  beforeDiagram,
  afterDiagram,
  opportunityMapping,
  clientName,
  keyPrefix,
}: SectionProps) {
  const views = buildStageViews(afterDiagram);
  if (views.length === 0) return null;
  const readiness = readinessScores(buildStressViews(opportunityMapping.findings, afterDiagram));
  const beforeCount = beforeDiagram.steps.length;
  const afterCount = afterDiagram.steps.length;
  const automated = views.filter((view) => view.stage.mode === "automated").length;
  const checkpoints = views.filter((view) => view.stage.humanCheckpoint).length;

  return (
    <SectionPage clientName={clientName}>
      <CardRows
        lead={
          <SectionHeader
            kicker="Where you are going"
            title={`Transformed workflow: ${departmentName}`}
            subtitle="Machines take the repetitive, high-volume work; people keep the decisions that matter. Built to hold up when a key person is away or demand surges."
            stats={[
              { label: "steps", value: beforeCount > afterCount ? `${beforeCount} to ${afterCount}` : String(afterCount) },
              ...(readiness.today !== null && readiness.after !== null
                ? [{ label: "scale readiness", value: `${readiness.today} to ${readiness.after}` }]
                : []),
              { label: "stages automated", value: `${automated} of ${views.length}` },
              { label: "human checkpoints", value: String(checkpoints) },
            ]}
            legend={[
              { swatch: { backgroundColor: colors.primary }, label: "AI, automation or system" },
              { swatch: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: wf.stageBorder }, label: "Your team, with better information" },
              { swatch: { backgroundColor: wf.opportunityFill, borderLeftWidth: 2, borderLeftColor: colors.accent }, label: "Human in the loop" },
            ]}
          />
        }
        items={views}
        columns={4}
        keyPrefix={keyPrefix}
        cell={(view) => {
          const dark = view.stage.mode === "automated";
          const unchanged = view.stage.mode === "unchanged";
          const soft = dark ? colors.secondary : colors.accent;
          return (
            <View
              style={[
                pdfStyles.card,
                { backgroundColor: dark ? colors.primary : "#ffffff", borderColor: dark ? colors.primary : wf.stageBorder },
              ]}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Eyebrow text={`Stage ${pad2(view.number)}`} color={soft} />
                <Pill tone={unchanged ? TONE.muted : TONE.azure} text={stageTag(view.stage)} />
              </View>
              <Text style={[pdfStyles.cardTitle, { color: dark ? colors.background : colors.primary, marginTop: 7 }]}>
                {view.stage.title}
              </Text>
              {view.stage.summary ? (
                <Text style={[pdfStyles.cardText, { color: dark ? "#d5dbe6" : wf.muted }]}>{brief(view.stage.summary, 170)}</Text>
              ) : null}
              {view.stage.builds && view.stage.builds.length > 0 ? (
                <Text style={[pdfStyles.small, { marginTop: 6, fontWeight: 700, color: dark ? colors.secondary : colors.accent }]}>
                  {`Powered by ${view.stage.builds.join(" · ")}`}
                </Text>
              ) : null}
              {view.stage.humanCheckpoint ? (
                <View
                  style={[
                    pdfStyles.inset,
                    { borderLeftColor: soft, backgroundColor: dark ? "#2b3854" : wf.opportunityFill },
                  ]}
                >
                  <Eyebrow text="Human in the loop" color={soft} />
                  <Text style={[pdfStyles.small, { marginTop: 2, color: dark ? colors.background : colors.primary }]}>
                    {brief(view.stage.humanCheckpoint, 130)}
                  </Text>
                </View>
              ) : null}
              <View style={pdfStyles.spacer} />
              {view.stage.replaces ? (
                <View style={[pdfStyles.rule, { borderTopColor: dark ? "#3a4766" : wf.stageBorder }]}>
                  <Eyebrow text="Replaces" color={soft} />
                  <Text style={[pdfStyles.small, { marginTop: 2, color: dark ? "#c3cbd9" : wf.muted }]}>
                    {brief(view.stage.replaces, 120)}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </SectionPage>
  );
}

const TIERS: { tier: Solution["tier"]; label: string; note: string; tone: PillStyle }[] = [
  { tier: "priority", label: "Priority", note: "The biggest, best-grounded impact. Build these first.", tone: TONE.dark },
  { tier: "recommended", label: "Recommended", note: "Solid next moves once the priorities are live.", tone: TONE.azure },
  { tier: "nice-to-have", label: "Nice to have", note: "Smaller wins to add as the core settles.", tone: TONE.muted },
];

const PHASE_HEADER: PillStyle[] = [
  { backgroundColor: colors.primary, color: colors.background },
  { backgroundColor: colors.secondary, color: colors.primary },
  { backgroundColor: colors.tertiary, color: colors.primary },
];

/* 4. Recommendations: builds ranked from priority to nice to have, then the
 * 90 day transformation roadmap on its own page. */
function RecommendationsSection({
  departmentName,
  beforeDiagram,
  afterDiagram,
  opportunityMapping,
  clientName,
  keyPrefix,
}: SectionProps) {
  const solutions = opportunityMapping.solutions;
  const rankOf = new Map(solutions.map((solution, i) => [solution, i + 1]));
  const stages = buildStageViews(beforeDiagram);
  const fixesFor = (solution: Solution) =>
    [
      ...new Set(
        solution.addressesBottleneckStepIds
          .map((id) => stages.find((view) => view.stage.stepIds.includes(id))?.number)
          .filter((n): n is number => !!n),
      ),
    ]
      .sort((a, b) => a - b)
      .map(pad2);
  const afterStages = buildStageViews(afterDiagram);
  const transformedBy = (titles: string[]) =>
    afterStages.filter((view) => view.stage.builds?.some((b) => titles.includes(b))).map((view) => pad2(view.number));
  const roadmap = buildRoadmap(solutions);

  return (
    <SectionPage clientName={clientName}>
      <SectionHeader
        kicker="What we recommend"
        title={`Recommendations: ${departmentName}`}
        subtitle="The builds we propose, ranked from priority to nice to have, then sequenced into a 90 day transformation roadmap. Impact and effort are Refactrd's estimates at this stage and will be tightened during scoping."
        stats={TIERS.map(({ tier, label }) => ({
          label: label.toLowerCase(),
          value: String(solutions.filter((s) => s.tier === tier).length),
        }))}
      />
      {solutions.length === 0 ? (
        <Text style={pdfStyles.empty}>No builds could be grounded from the material available.</Text>
      ) : null}

      {TIERS.map(({ tier, label, note, tone }) => {
        const inTier = solutions.filter((s) => s.tier === tier);
        if (inTier.length === 0) return null;
        return (
          <View key={`${keyPrefix}-${tier}`}>
            <CardRows
              lead={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, marginBottom: 8 }}>
                  <Pill tone={tone} text={`${label} · ${TIMELINE_BY_TIER[tier]}`} />
                  <Text style={pdfStyles.note}>{note}</Text>
                </View>
              }
              items={inTier}
              columns={3}
              keyPrefix={`${keyPrefix}-${tier}-cards`}
              cell={(solution) => {
                const fixes = fixesFor(solution);
                const priority = tier === "priority";
                return (
                  <View style={[pdfStyles.card, priority ? { borderTopWidth: 3, borderTopColor: colors.primary } : {}]}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <NumberBadge n={rankOf.get(solution) ?? 0} dark={priority} />
                      {solution.kind ? (
                        <Pill tone={FIX_TONE[solution.kind]} text={FIX_TYPE_LABEL[solution.kind]} />
                      ) : null}
                    </View>
                    <Text style={[pdfStyles.cardTitle, { marginTop: 7 }]}>{solution.title}</Text>
                    {solution.summary ? <Text style={pdfStyles.cardText}>{solution.summary}</Text> : null}
                    {solution.replaces ? (
                      <Text style={[pdfStyles.small, { color: wf.muted }]}>{`Replaces: ${brief(solution.replaces, 160)}`}</Text>
                    ) : null}
                    {fixes.length > 0 ? (
                      <Text style={[pdfStyles.small, { color: wf.muted }]}>
                        {`Fixes stage${fixes.length === 1 ? "" : "s"} ${fixes.join(", ")}`}
                      </Text>
                    ) : null}
                    {priority ? (
                      <View style={[pdfStyles.inset, { borderLeftColor: colors.accent, backgroundColor: colors.tertiary }]}>
                        <Eyebrow text="Why this first" color={colors.accent} />
                        <Text style={[pdfStyles.small, { marginTop: 2 }]}>{solution.rationale}</Text>
                      </View>
                    ) : null}
                    {solution.timeSavedEstimate ? (
                      <Text style={[pdfStyles.small, { fontWeight: 700, color: colors.accent }]}>
                        {`Estimated time saved: ${solution.timeSavedEstimate}`}
                      </Text>
                    ) : null}
                    <View style={pdfStyles.spacer} />
                    <View style={pdfStyles.pillRow}>
                      {solution.impact ? (
                        <Pill tone={LEVEL_TONE[solution.impact]} text={`${LEVEL_LABEL[solution.impact]} impact`} />
                      ) : null}
                      {solution.effort ? (
                        <Pill tone={LEVEL_TONE[solution.effort]} text={`${LEVEL_LABEL[solution.effort]} effort`} />
                      ) : null}
                    </View>
                  </View>
                );
              }}
            />
          </View>
        );
      })}

      {solutions.length > 0 ? (
        <View break>
          <SectionHeader
            kicker="90 day transformation roadmap"
            title={`What we build, and when: ${departmentName}`}
            subtitle="Anything another build depends on comes first."
          />
          <View style={{ flexDirection: "row", gap: 3 }}>
            {PHASE_HEADER.map((style, i) => (
              <View key={`${keyPrefix}-bar-${i}`} style={{ flexGrow: 1, height: 5, borderRadius: 3, backgroundColor: style.backgroundColor }} />
            ))}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 3, marginBottom: 10 }}>
            {["Day 1", "Day 30", "Day 60", "Day 90"].map((day) => (
              <Text key={`${keyPrefix}-${day}`} style={{ fontSize: 7, color: wf.muted }}>
                {day}
              </Text>
            ))}
          </View>
          <View style={pdfStyles.row} wrap={false}>
            {roadmap.phases.map((phase, i) => {
              const transforms = transformedBy(phase.solutions.map((s) => s.title));
              return (
                <View key={`${keyPrefix}-phase-${i}`} style={[pdfStyles.card, { flexBasis: 0, padding: 8, minHeight: 250 }]}>
                  <View style={[{ borderRadius: 6, paddingVertical: 9, paddingHorizontal: 11, marginBottom: 4 }, PHASE_HEADER[i]]}>
                    <Text style={[pdfStyles.eyebrow, { color: PHASE_HEADER[i].color }]}>{phase.rangeDays.toUpperCase()}</Text>
                    <Text style={{ fontSize: 14, fontFamily: "Poppins", fontWeight: 700, marginTop: 3, color: PHASE_HEADER[i].color }}>
                      {phase.label}
                    </Text>
                    <Text style={{ fontSize: 8, marginTop: 2, color: PHASE_HEADER[i].color }}>{phase.aim}</Text>
                  </View>
                  {phase.solutions.length === 0 ? (
                    <Text style={[pdfStyles.cardText, { color: wf.muted, paddingHorizontal: 3 }]}>
                      Nothing scheduled in this phase.
                    </Text>
                  ) : (
                    phase.solutions.map((solution) => (
                      <View
                        key={`${keyPrefix}-phase-${i}-${solution.title}`}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 7,
                          paddingVertical: 7,
                          paddingHorizontal: 3,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.tertiary,
                        }}
                      >
                        <NumberBadge n={rankOf.get(solution) ?? 0} dark={i === 0} />
                        <Text style={{ flexGrow: 1, flexBasis: 0, fontSize: 9, fontWeight: 700 }}>{solution.title}</Text>
                        {solution.kind ? (
                          <Pill tone={FIX_TONE[solution.kind]} text={FIX_TYPE_LABEL[solution.kind]} />
                        ) : null}
                      </View>
                    ))
                  )}
                  {transforms.length > 0 ? (
                    <Text style={[pdfStyles.small, { color: wf.muted, paddingHorizontal: 3, marginTop: 8 }]}>
                      {`Powers transformed stage${transforms.length === 1 ? "" : "s"} ${transforms.join(", ")}`}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </SectionPage>
  );
}
