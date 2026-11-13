import { Document } from "@react-pdf/renderer";

import type { Bottleneck } from "@/lib/immersion/bottleneck-extraction";
import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import type { OpportunityMapping } from "@/lib/immersion/opportunity-mapping";
import { CoverPage, departmentSections } from "@/lib/immersion/pdf/shared";

/**
 * The client-facing department PDF. Refactrd's real brand, not Compass's own
 * (CLAUDE.md, Phase 2 non-negotiable): the cover, then the department's
 * sections in the same order and layout as its result tabs, current
 * workflow, what we found, transformed workflow, recommendations with the 90
 * day roadmap (lib/immersion/pdf/shared.tsx, departmentSections).
 *
 * Typography: real Refactrd fonts, registered in shared.tsx from
 * @fontsource/poppins and @fontsource/montserrat. Codec Pro itself stays
 * unavailable (licensed, no font file to embed), so this uses the brand
 * guideline's own documented fallback for that case, Poppins for headings,
 * rather than collapsing everything onto the body font.
 *
 * Evidence and grounding (see the result tabs) are deliberately not shown
 * here: they are the consultant's own verification surface before a
 * document goes to a client, not something a prospective client should see
 * in the deliverable itself.
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
  return (
    <Document>
      <CoverPage
        label="OPPORTUNITY MAPPING"
        title={clientName}
        subtitle={departmentName}
        lead="Where this department's work is today, what we found when we pushed on it, how it runs once transformed, and what we recommend building first."
        clientName={clientName}
        date={date}
      />
      {departmentSections(
        { departmentName, beforeDiagram, afterDiagram, bottlenecks, opportunityMapping },
        { clientName, keyPrefix: "dept" },
      )}
    </Document>
  );
}
