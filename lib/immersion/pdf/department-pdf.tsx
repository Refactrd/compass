import { Document, Page, Text, View } from "@react-pdf/renderer";

import type { Bottleneck } from "@/lib/immersion/bottleneck-extraction";
import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import type { OpportunityMapping } from "@/lib/immersion/opportunity-mapping";
import {
  DiagramSection,
  pdfStyles,
  ReportFooter,
  ReportLogo,
  TIER_LABEL,
} from "@/lib/immersion/pdf/shared";

/**
 * The client-facing department PDF. Refactrd's real brand, not Compass's own
 * (CLAUDE.md, Phase 2 non-negotiable) — same colors as
 * components/immersion/workflow-diagram.tsx, but a parallel implementation:
 * react-pdf renders through its own View/Text/Image primitives, not regular
 * DOM/HTML, so the on-screen component cannot be reused directly. Both read
 * the same WorkflowDiagram data and the same brand/token.ts values, which is
 * what keeps them "one deliberately designed template" in the sense that
 * matters, one visual design, rather than one literal React component.
 *
 * Typography: real Refactrd fonts, registered in shared.tsx from
 * @fontsource/poppins and @fontsource/montserrat. Codec Pro itself stays
 * unavailable (licensed, no font file to embed), so this uses the brand
 * guideline's own documented fallback for that case, Poppins for headings,
 * rather than collapsing everything onto the body font.
 *
 * Grounding chips (see components/immersion/opportunity-mapping-view.tsx)
 * are deliberately not shown here: they are the consultant's own
 * verification surface before a document goes to a client, not something a
 * prospective client should see in the deliverable itself.
 */

export function DepartmentPdfDocument({
  clientName,
  departmentName,
  date,
  beforeDiagram,
  bottlenecks,
  opportunityMapping,
  afterDiagram,
}: {
  clientName: string;
  departmentName: string;
  date: string;
  beforeDiagram: WorkflowDiagram;
  bottlenecks: Bottleneck[];
  opportunityMapping: OpportunityMapping;
  afterDiagram: WorkflowDiagram;
}) {
  const stepLabel = (stepId: string) =>
    beforeDiagram.steps.find((step) => step.id === stepId)?.label ?? stepId;

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <ReportLogo />
        <Text style={pdfStyles.h1}>{departmentName}</Text>
        <Text style={pdfStyles.meta}>{`${clientName} · Opportunity Mapping · ${date}`}</Text>

        <DiagramSection title="Current workflow" diagram={beforeDiagram} keyPrefix="before" />

        <Text style={pdfStyles.h2}>Bottlenecks identified</Text>
        {bottlenecks.length === 0 ? (
          <Text style={{ fontSize: 9, opacity: 0.6 }}>None identified from this interview.</Text>
        ) : (
          bottlenecks.map((bottleneck, i) => (
            <View key={`bottleneck-${i}`} style={pdfStyles.bottleneckCard} wrap={false}>
              <Text style={pdfStyles.bottleneckStep}>{stepLabel(bottleneck.stepId)}</Text>
              <Text style={pdfStyles.bottleneckDescription}>{bottleneck.description}</Text>
            </View>
          ))
        )}
      </Page>

      <Page size="A4" style={pdfStyles.page}>
        <Text style={pdfStyles.h2}>Recommended solutions</Text>
        {opportunityMapping.solutions.length === 0 ? (
          <Text style={{ fontSize: 9, opacity: 0.6 }}>
            No solutions could be grounded from the material available.
          </Text>
        ) : (
          opportunityMapping.solutions.map((solution, i) => (
            <View key={`solution-${i}`} style={pdfStyles.solutionCard} wrap={false}>
              <Text style={pdfStyles.tierBadge}>{TIER_LABEL[solution.tier]}</Text>
              <Text style={pdfStyles.solutionTitle}>{solution.title}</Text>
              <Text style={pdfStyles.solutionRationale}>{solution.rationale}</Text>
              {solution.timeSavedEstimate ? (
                <Text
                  style={pdfStyles.timeSaved}
                >{`Estimated time saved: ${solution.timeSavedEstimate}`}</Text>
              ) : null}
            </View>
          ))
        )}

        <ReportFooter clientName={clientName} />
      </Page>

      <Page size="A4" style={pdfStyles.page}>
        <DiagramSection title="Transformed workflow" diagram={afterDiagram} keyPrefix="after" />
        <ReportFooter clientName={clientName} />
      </Page>
    </Document>
  );
}
