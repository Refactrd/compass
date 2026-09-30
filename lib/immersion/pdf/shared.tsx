import path from "node:path";

import { Font, Image, StyleSheet, Text, View } from "@react-pdf/renderer";

import { refactrdBrand } from "@/brand/token";
import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import type { Solution } from "@/lib/immersion/opportunity-mapping";

/**
 * Shared building blocks for every Phase 2 PDF (the department Opportunity
 * Mapping PDF and the Comprehensive Report): Refactrd's real brand tokens,
 * the shared style sheet, and the one diagram template component, so both
 * documents stay visually identical rather than drifting into two designs.
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

export const { colors } = refactrdBrand;

export const LOGO_PATH = path.join(process.cwd(), "brand", "logo-light-bg.png");

export const pdfStyles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Montserrat",
    color: colors.text,
    backgroundColor: colors.background,
  },
  logo: { width: 110, marginBottom: 24 },
  h1: {
    fontSize: 20,
    fontFamily: "Poppins",
    fontWeight: 700,
    color: colors.primary,
    marginBottom: 4,
  },
  meta: { fontSize: 10, color: colors.text, opacity: 0.7, marginBottom: 24 },
  h2: {
    fontSize: 13,
    fontFamily: "Poppins",
    fontWeight: 700,
    color: colors.primary,
    marginTop: 20,
    marginBottom: 10,
  },
  h3: {
    fontSize: 11,
    fontFamily: "Poppins",
    fontWeight: 700,
    color: colors.text,
    marginTop: 12,
    marginBottom: 6,
  },
  stepRow: { flexDirection: "row", marginBottom: 10 },
  rail: { width: 24, alignItems: "center" },
  circle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  circleText: { fontSize: 8, fontFamily: "Montserrat", fontWeight: 700, color: colors.background },
  stepCard: {
    flex: 1,
    marginLeft: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.tertiary,
    borderRadius: 6,
  },
  stepHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  // minWidth: 0 is the actual fix, not flex: 1 alone: a flex item's default
  // min-width is its content's intrinsic width, which blocks shrinking (and
  // therefore wrapping) below that regardless of flex: 1. Same classic
  // flexbox behavior in react-pdf's Yoga layout as in CSS.
  stepLabel: {
    fontSize: 10.5,
    fontFamily: "Montserrat",
    fontWeight: 700,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  actorTag: {
    fontSize: 8,
    color: colors.accent,
    backgroundColor: colors.tertiary,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    flexShrink: 0,
  },
  stepDescription: { fontSize: 9, marginTop: 3, opacity: 0.75 },
  branchBadge: {
    fontSize: 8.5,
    color: colors.primary,
    backgroundColor: colors.secondary,
    padding: 4,
    borderRadius: 4,
    marginTop: 4,
  },
  bottleneckCard: {
    padding: 8,
    borderWidth: 1,
    borderColor: colors.tertiary,
    borderRadius: 6,
    marginBottom: 8,
  },
  bottleneckStep: { fontSize: 10, fontFamily: "Montserrat", fontWeight: 700 },
  bottleneckDescription: { fontSize: 9, marginTop: 2 },
  solutionCard: {
    padding: 10,
    borderWidth: 1,
    borderColor: colors.tertiary,
    borderRadius: 6,
    marginBottom: 10,
  },
  tierBadge: {
    fontSize: 8,
    fontFamily: "Montserrat",
    fontWeight: 700,
    color: colors.background,
    backgroundColor: colors.primary,
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 4,
  },
  solutionTitle: { fontSize: 11, fontFamily: "Montserrat", fontWeight: 700 },
  solutionRationale: { fontSize: 9.5, marginTop: 3 },
  timeSaved: {
    fontSize: 9,
    color: colors.accent,
    marginTop: 4,
    fontFamily: "Montserrat",
    fontWeight: 700,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: colors.text,
    opacity: 0.5,
    textAlign: "center",
  },
  phaseBlock: {
    padding: 10,
    borderWidth: 1,
    borderColor: colors.tertiary,
    borderRadius: 6,
    marginBottom: 10,
  },
  phaseLabel: {
    fontSize: 10,
    fontFamily: "Montserrat",
    fontWeight: 700,
    color: colors.background,
    backgroundColor: colors.accent,
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 6,
  },
  roadmapItem: { fontSize: 9.5, marginTop: 4 },
  roadmapItemTitle: { fontFamily: "Montserrat", fontWeight: 700 },
  tocEntry: { fontSize: 10.5, marginTop: 6 },
});

export const TIER_LABEL: Record<Solution["tier"], string> = {
  priority: "Priority",
  recommended: "Recommended",
  "nice-to-have": "Nice to have",
};

export function DiagramSection({
  title,
  diagram,
  keyPrefix,
}: {
  title: string;
  diagram: WorkflowDiagram;
  /** step.id ("step-1", "step-2", ...) is assigned positionally, so every
   * diagram in a document that renders more than one (a department's before
   * and after, or a whole Comprehensive Report's several departments) reuses
   * the exact same ids. react-pdf's custom reconciler has been observed
   * producing duplicated text specifically on whichever section needs to
   * paginate when sibling elements across sections share keys, plausibly
   * because it does not scope key lookups as strictly as react-dom does
   * during its layout/re-measure pass. Prefixing makes every key in the
   * document genuinely unique, not just locally unique per map. Callers must
   * pass a prefix unique across the whole document they render into, not
   * just unique to one department. */
  keyPrefix: string;
}) {
  const branchesByFromStep = new Map<string, WorkflowDiagram["branches"]>();
  for (const branch of diagram.branches) {
    const list = branchesByFromStep.get(branch.fromStepId) ?? [];
    list.push(branch);
    branchesByFromStep.set(branch.fromStepId, list);
  }
  const stepIndexById = new Map(diagram.steps.map((step, i) => [step.id, i + 1]));

  return (
    <View>
      <Text style={pdfStyles.h2}>{title}</Text>
      {diagram.steps.length === 0 ? (
        <Text style={{ fontSize: 9, opacity: 0.6 }}>No workflow extracted.</Text>
      ) : (
        diagram.steps.map((step, index) => {
          const branches = branchesByFromStep.get(step.id) ?? [];
          return (
            <View key={`${keyPrefix}-${step.id}`} style={pdfStyles.stepRow}>
              <View style={pdfStyles.rail}>
                <View style={pdfStyles.circle}>
                  <Text style={pdfStyles.circleText}>{index + 1}</Text>
                </View>
              </View>
              <View style={pdfStyles.stepCard}>
                <View style={pdfStyles.stepHeader}>
                  <Text style={pdfStyles.stepLabel}>{step.label}</Text>
                  {step.actor ? <Text style={pdfStyles.actorTag}>{step.actor}</Text> : null}
                </View>
                {step.description ? (
                  <Text style={pdfStyles.stepDescription}>{step.description}</Text>
                ) : null}
                {branches.map((branch, i) => {
                  const targetIndex = stepIndexById.get(branch.toStepId) ?? "?";
                  const text = `If ${branch.condition}, skip to step ${targetIndex}.`;
                  // A single pre-built string, not interleaved {expr}
                  // children: see the note on react-pdf's text layout engine
                  // in the module comment above.
                  return (
                    <Text key={`${keyPrefix}-${step.id}-branch-${i}`} style={pdfStyles.branchBadge}>
                      {text}
                    </Text>
                  );
                })}
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

export function ReportLogo() {
  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop
  return <Image src={LOGO_PATH} style={pdfStyles.logo} />;
}

export function ReportFooter({ clientName }: { clientName: string }) {
  return (
    <Text
      style={pdfStyles.footer}
      fixed
    >{`Refactrd · prepared for ${clientName} · confidential`}</Text>
  );
}
