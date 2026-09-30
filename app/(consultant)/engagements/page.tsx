import Link from "next/link";
import { Archive, Plus } from "lucide-react";

import { EngagementsList, type EngagementRow } from "@/components/immersion/engagements-list";
import { requireActiveMember } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Immersion days · Compass" };

/**
 * Every non-archived Engagement, shared across active members (CLAUDE.md,
 * Phase 2: visibility follows Client, not per-consultant Conversation). An
 * admin needs to see every immersion day for the output-quality oversight
 * CLAUDE.md asks for; a consultant benefits from seeing a colleague's
 * in-progress engagement too, the same reasoning as shared Client records.
 *
 * Archived engagements (migration 0010) are deliberately excluded here, not
 * just visually deemphasized: that is the point of archiving one. Admins can
 * still reach them from Admin -> Archived immersion days.
 */
export default async function EngagementsPage() {
  const profile = await requireActiveMember();

  const supabase = await createClient();
  const { data: engagements } = await supabase
    .from("engagements")
    .select("id, date, status, created_at, clients(name), departments(id, status)")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  // Nested PostgREST embed, same reasoning as the PDF action: Relationships
  // is declared empty in the hand-maintained Database type, so this shape is
  // asserted, not inferred.
  const rows: EngagementRow[] = (engagements ?? []).map((engagement) => {
    const client = (engagement as unknown as { clients: { name: string } | null }).clients;
    const departments =
      (engagement as unknown as { departments: { id: string; status: string }[] })
        .departments ?? [];
    return {
      id: engagement.id,
      date: engagement.date,
      status: engagement.status,
      clientName: client?.name ?? "Unnamed client",
      departmentTotal: departments.length,
      departmentDone: departments.filter((d) => d.status === "complete").length,
    };
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Immersion days</h1>
          <p className="mt-1 text-sm text-slate">
            Each Engagement is one immersion day at one client, department by
            department.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {profile.role === "admin" ? (
            <Link
              href="/admin/engagements"
              className="flex items-center gap-1.5 text-xs text-slate hover:text-ink"
            >
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              Archived
            </Link>
          ) : null}
          <Link
            href="/engagements/new"
            className="flex items-center gap-1.5 rounded-md bg-brass px-3 py-2 text-sm font-medium text-white hover:bg-brass-strong"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Start
          </Link>
        </div>
      </div>

      <EngagementsList rows={rows} isAdmin={profile.role === "admin"} />
    </div>
  );
}
