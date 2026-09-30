import { notFound } from "next/navigation";

import { DepartmentWorkspace } from "@/components/immersion/department-workspace";
import { requireActiveMember } from "@/lib/auth/guards";
import type { Bottleneck } from "@/lib/immersion/bottleneck-extraction";
import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import type { OpportunityMapping } from "@/lib/immersion/opportunity-mapping";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Department · Compass" };

/**
 * The full per-department pipeline: transcript, both diagrams, bottlenecks,
 * Opportunity Mapping, the PDF, and the continue-or-finish decision.
 */
export default async function DepartmentPage({
  params,
}: {
  params: Promise<{ engagementId: string; departmentId: string }>;
}) {
  await requireActiveMember();
  const { engagementId, departmentId } = await params;

  const supabase = await createClient();

  // RLS scopes this to engagements/departments the caller may see (shared
  // read, per migration 0007); a forged or someone-else's-and-hidden id reads
  // as not found either way, which is the correct behaviour.
  const { data: department } = await supabase
    .from("departments")
    .select(
      "id, name, transcript, before_diagram, bottlenecks, opportunity_mapping, after_diagram, pdf_storage_path, engagement_id",
    )
    .eq("id", departmentId)
    .eq("engagement_id", engagementId)
    .maybeSingle();

  if (!department) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          {department.name}
        </h1>
        <p className="mt-1 text-sm text-slate">
          Paste the interview transcript for this department to extract its
          current workflow, then find bottlenecks and grounded solutions.
        </p>
      </div>

      <DepartmentWorkspace
        engagementId={engagementId}
        departmentId={department.id}
        departmentName={department.name}
        initialTranscript={department.transcript ?? ""}
        initialDiagram={department.before_diagram as unknown as WorkflowDiagram | null}
        initialBottlenecks={department.bottlenecks as unknown as Bottleneck[] | null}
        initialOpportunityMapping={
          department.opportunity_mapping as unknown as OpportunityMapping | null
        }
        initialAfterDiagram={department.after_diagram as unknown as WorkflowDiagram | null}
        initialPdfPath={department.pdf_storage_path}
      />
    </div>
  );
}
