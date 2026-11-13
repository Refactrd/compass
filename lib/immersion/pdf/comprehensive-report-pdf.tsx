import { Document, Text, View } from "@react-pdf/renderer";

import type { Bottleneck } from "@/lib/immersion/bottleneck-extraction";
import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import type { OpportunityMapping } from "@/lib/immersion/opportunity-mapping";
import {
  colors,
  CoverPage,
  departmentSections,
  SectionHeader,
  SectionPage,
} from "@/lib/immersion/pdf/shared";
import { buildStressViews, readinessScores } from "@/lib/immersion/stage-view";
import {
  computeAverageScore,
  computeWorkflowScore,
  scoreLabel,
} from "@/lib/immersion/workflow-score";

/**
 * The Comprehensive Report: one collated document across every Department in
 * a finished Engagement (CLAUDE.md, Phase 2 days 10-11). Before/after per
 * department plus a 90-day roadmap per department, exactly what CLAUDE.md's
 * "Data model additions" names as this artifact's content.
 *
 * Cover, contents, then each department's sections exactly as in its own
 * PDF and result tabs (lib/immersion/pdf/shared.tsx, departmentSections):
 * current workflow, what we found, transformed workflow, recommendations
 * with the 90 day roadmap, so the two documents never drift apart.
 */

export type ReportDepartment = {
  name: string;
  beforeDiagram: WorkflowDiagram;
  afterDiagram: WorkflowDiagram;
  bottlenecks: Bottleneck[];
  opportunityMapping: OpportunityMapping;
};

export function ComprehensiveReportPdfDocument({
  clientName,
  date,
  departments,
}: {
  clientName: string;
  date: string;
  departments: ReportDepartment[];
}) {
  const departmentScores = departments.map((d) => computeWorkflowScore(d.bottlenecks.length).score);
  const overallScore = computeAverageScore(departmentScores);

  return (
    <Document>
      <CoverPage
        label="BUSINESS IMMERSION FINDINGS"
        title={clientName}
        subtitle="Workflow findings and transformation plan"
        lead="Where each department's work is today, what we found when we pushed on it, how it runs once transformed, and the order we propose to build it in."
        clientName={clientName}
        date={date}
      />

      <SectionPage clientName={clientName}>
        <SectionHeader
          kicker="Contents"
          title="Inside this report"
          subtitle={`Overall workflow health ${overallScore}/100 (${scoreLabel(overallScore)}), the mean of each department's score: 100 minus 15 per bottleneck identified. A computed indicator, not a measured figure.`}
          stats={[{ label: departments.length === 1 ? "department" : "departments", value: String(departments.length) }]}
        />
        {departments.map((department, i) => {
          const { score } = computeWorkflowScore(department.bottlenecks.length);
          const { today, after } = readinessScores(
            buildStressViews(department.opportunityMapping.findings, department.afterDiagram),
          );
          const builds = department.opportunityMapping.solutions.length;
          const scale = today !== null ? `, scale readiness ${today}/100${after !== null ? ` to ${after}/100` : ""}` : "";
          return (
            <View
              key={`toc-${i}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderBottomWidth: 1,
                borderBottomColor: colors.workflow.stageBorder,
                paddingVertical: 12,
              }}
            >
              <Text style={{ width: 56, fontSize: 18, fontFamily: "Poppins", fontWeight: 700, color: colors.accent }}>
                {String(i + 1).padStart(2, "0")}
              </Text>
              <View style={{ flexGrow: 1, flexBasis: 0 }}>
                <Text style={{ fontSize: 13, fontFamily: "Poppins", fontWeight: 700 }}>{department.name}</Text>
                <Text style={{ fontSize: 8.5, color: colors.workflow.muted, marginTop: 2 }}>
                  {`${department.bottlenecks.length} bottleneck${department.bottlenecks.length === 1 ? "" : "s"}, ${builds} recommended build${builds === 1 ? "" : "s"}, workflow health ${score}/100${scale}.`}
                </Text>
              </View>
            </View>
          );
        })}
      </SectionPage>

      {departments.flatMap((department, i) =>
        departmentSections(
          {
            departmentName: department.name,
            beforeDiagram: department.beforeDiagram,
            afterDiagram: department.afterDiagram,
            bottlenecks: department.bottlenecks,
            opportunityMapping: department.opportunityMapping,
          },
          { clientName, keyPrefix: `dept-${i}` },
        ),
      )}
    </Document>
  );
}
