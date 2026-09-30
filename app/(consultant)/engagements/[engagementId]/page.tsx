import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Plus } from "lucide-react";

import { AddDepartmentForm } from "@/components/immersion/add-department-form";
import { ComprehensiveReportButton } from "@/components/immersion/comprehensive-report-button";
import { requireActiveMember } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Engagement · Compass" };

export default async function EngagementPage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  await requireActiveMember();
  const { engagementId } = await params;

  const supabase = await createClient();
  const { data: engagement } = await supabase
    .from("engagements")
    .select("id, date, status, report_storage_path, clients(name)")
    .eq("id", engagementId)
    .maybeSingle();

  if (!engagement) notFound();

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, status, pdf_storage_path, created_at")
    .eq("engagement_id", engagementId)
    .order("created_at", { ascending: true });

  const rows = departments ?? [];
  const client = (engagement as unknown as { clients: { name: string } | null }).clients;
  const isComplete = engagement.status === "complete";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <Link href="/engagements" className="text-xs text-slate hover:text-ink">
          &larr; All immersion days
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-ink">
            {client?.name ?? "Unnamed client"}
          </h1>
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs font-medium",
              isComplete
                ? "border-brass/30 bg-brass-tint text-brass-strong"
                : "border-border-strong bg-surface-sunken text-slate",
            )}
          >
            {isComplete ? "Complete" : "In progress"}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate">
          {new Date(`${engagement.date}T00:00:00Z`).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          })}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((department) => (
          <li
            key={department.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
          >
            <Link
              href={`/engagements/${engagementId}/departments/${department.id}`}
              className="flex-1 font-medium text-ink hover:text-brass"
            >
              {department.name}
            </Link>
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs font-medium",
                department.status === "complete"
                  ? "border-brass/30 bg-brass-tint text-brass-strong"
                  : "border-border-strong bg-surface-sunken text-slate",
              )}
            >
              {department.status === "complete" ? "Complete" : "In progress"}
            </span>
            {department.pdf_storage_path ? (
              <a
                href={`/api/engagements/departments/${department.id}/pdf`}
                download={`${department.name}-opportunity-mapping.pdf`}
                aria-label={`Download PDF for ${department.name}`}
                className="text-slate hover:text-brass"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </a>
            ) : null}
          </li>
        ))}
      </ul>

      {!isComplete ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add a department
          </h2>
          <div className="mt-3">
            <AddDepartmentForm engagementId={engagementId} />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-medium text-ink">Comprehensive Report</h2>
          <p className="mt-1 text-xs text-slate">
            Collates every department: before and after workflows, and a 90
            day roadmap for each.
          </p>
          <div className="mt-3">
            <ComprehensiveReportButton
              engagementId={engagementId}
              initialReportPath={engagement.report_storage_path}
            />
          </div>
        </div>
      )}
    </div>
  );
}
