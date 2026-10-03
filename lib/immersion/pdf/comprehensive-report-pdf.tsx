import { Document, Page, Text, View } from "@react-pdf/renderer";

import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import { buildRoadmap } from "@/lib/immersion/roadmap";
import type { Solution } from "@/lib/immersion/opportunity-mapping";
import {
  DiagramSection,
  pdfStyles,
  ReportFooter,
  ReportLogo,
  TIER_LABEL,
} from "@/lib/immersion/pdf/shared";
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
 * Deliberately condensed where the department-level PDF is already
 * thorough: solution rationale and grounding both live in that document, one
 * per department, so this report shows each solution as a title and its
 * time-saved figure only, sequenced into its roadmap phase. Repeating full
 * rationale for every solution across every department here would make a
 * report meant to be read start to finish unreadable, and the detail has
 * not gone away, it is one click away in the department's own PDF.
 */

export type ReportDepartment = {
  name: string;
  beforeDiagram: WorkflowDiagram;
  afterDiagram: WorkflowDiagram;
  solutions: Solution[];
  bottleneckCount: number;
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
  const departmentScores = departments.map((d) => computeWorkflowScore(d.bottleneckCount).score);
  const overallScore = computeAverageScore(departmentScores);

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <ReportLogo />
        <Text style={pdfStyles.h1}>Comprehensive Report</Text>
        <Text style={pdfStyles.meta}>{`${clientName} · ${date}`}</Text>

        <View style={pdfStyles.phaseBlock} wrap={false}>
          <Text style={pdfStyles.h3}>
            {`Overall workflow health: ${overallScore}/100 (${scoreLabel(overallScore)})`}
          </Text>
          <Text style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>
            The mean of each department&apos;s own score below, each 100 minus
            15 per bottleneck identified during that department&apos;s
            interview. A computed indicator, not a measured or sourced figure.
          </Text>
        </View>

        <Text style={pdfStyles.h2}>Departments covered</Text>
        {departments.map((department, i) => {
          const { score } = computeWorkflowScore(department.bottleneckCount);
          return (
            <Text
              key={`toc-${i}`}
              style={pdfStyles.tocEntry}
            >{`${i + 1}. ${department.name} — health ${score}/100`}</Text>
          );
        })}

        <ReportFooter clientName={clientName} />
      </Page>

      {departments.map((department, deptIndex) => {
        const roadmap = buildRoadmap(department.solutions);
        const prefix = `dept-${deptIndex}`;
        const { score } = computeWorkflowScore(department.bottleneckCount);

        return (
          <Page key={prefix} size="A4" style={pdfStyles.page} wrap>
            <Text style={pdfStyles.h1}>{department.name}</Text>
            <Text style={pdfStyles.meta}>
              {`Workflow health score: ${score}/100 (${scoreLabel(score)})`}
            </Text>

            <DiagramSection
              title="Current workflow"
              diagram={department.beforeDiagram}
              keyPrefix={`${prefix}-before`}
            />
            <DiagramSection
              title="Transformed workflow"
              diagram={department.afterDiagram}
              keyPrefix={`${prefix}-after`}
            />

            <Text style={pdfStyles.h2}>90 day roadmap</Text>
            {roadmap.phases.length === 0 ? (
              <Text style={{ fontSize: 9, opacity: 0.6 }}>
                No grounded solutions to sequence for this department.
              </Text>
            ) : (
              roadmap.phases.map((phase, phaseIndex) => (
                <View
                  key={`${prefix}-phase-${phaseIndex}`}
                  style={pdfStyles.phaseBlock}
                  wrap={false}
                >
                  <Text style={pdfStyles.phaseLabel}>{`${phase.label}, ${phase.rangeDays}`}</Text>
                  {phase.solutions.map((solution, solutionIndex) => {
                    // One pre-built string, not nested/multiple <Text>
                    // children: the exact shape (several children in one
                    // paginated Text) that produced duplicated output
                    // elsewhere in this PDF pipeline. Sacrifices inline bold
                    // styling for reliability, a trade worth making twice.
                    const text = solution.timeSavedEstimate
                      ? `${TIER_LABEL[solution.tier]}: ${solution.title}. Estimated time saved: ${solution.timeSavedEstimate}.`
                      : `${TIER_LABEL[solution.tier]}: ${solution.title}.`;
                    return (
                      <Text
                        key={`${prefix}-phase-${phaseIndex}-solution-${solutionIndex}`}
                        style={pdfStyles.roadmapItem}
                      >
                        {text}
                      </Text>
                    );
                  })}
                </View>
              ))
            )}

            <ReportFooter clientName={clientName} />
          </Page>
        );
      })}
    </Document>
  );
}
