import Link from "next/link";
import { Briefcase, Plus } from "lucide-react";

import { requireActiveMember } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Immersion days · Compass" };

/**
 * Every Engagement, shared across active members (CLAUDE.md, Phase 2:
 * visibility follows Client, not per-consultant Conversation). An admin
 * needs to see every immersion day for the output-quality oversight CLAUDE.md
 * asks for; a consultant benefits from seeing a colleague's in-progress
 * engagement too, the same reasoning as shared Client records.
 */
export default async function EngagementsPage() {
  await requireActiveMember();

  const supabase = await createClient();
  const { data: engagements } = await supabase
    .from("engagements")
    .select("id, date, status, created_at, clients(name), departments(id, status)")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = engagements ?? [];

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
        <Link
          href="/engagements/new"
          className="flex items-center gap-1.5 rounded-md bg-brass px-3 py-2 text-sm font-medium text-white hover:bg-brass-strong"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Start
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface p-10 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken text-slate">
            <Briefcase className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm font-medium text-ink">No immersion days yet</p>
          <p className="mt-1 text-sm text-slate">
            Start one to work through a client&apos;s departments live onsite.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((engagement) => {
            // Nested PostgREST embed, same reasoning as the PDF action:
            // Relationships is declared empty in the hand-maintained
            // Database type, so this shape is asserted, not inferred.
            const client = (engagement as unknown as { clients: { name: string } | null })
              .clients;
            const departments =
              (engagement as unknown as { departments: { id: string; status: string }[] })
                .departments ?? [];
            const completeCount = departments.filter((d) => d.status === "complete").length;

            return (
              <li key={engagement.id}>
                <Link
                  href={`/engagements/${engagement.id}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 hover:border-border-strong"
                >
                  <div>
                    <p className="font-medium text-ink">{client?.name ?? "Unnamed client"}</p>
                    <p className="mt-0.5 text-xs text-slate">
                      {new Date(`${engagement.date}T00:00:00Z`).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      })}{" "}
                      &middot; {completeCount} of {departments.length} department
                      {departments.length === 1 ? "" : "s"} done
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-xs font-medium capitalize",
                      engagement.status === "complete"
                        ? "border-brass/30 bg-brass-tint text-brass-strong"
                        : "border-border-strong bg-surface-sunken text-slate",
                    )}
                  >
                    {engagement.status === "complete" ? "Complete" : "In progress"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
