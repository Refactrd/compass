import { Archive } from "lucide-react";

import { RestoreEngagementButton } from "@/components/admin/restore-engagement-button";
import { requireActiveAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Archived immersion days · Compass admin" };

/**
 * Every archived Engagement (migration 0010's soft delete). The everyday
 * /engagements list excludes these entirely, so this is the one place they
 * are still browsable, admin-only same as the delete action that put them
 * here.
 */
export default async function ArchivedEngagementsPage() {
  await requireActiveAdmin();

  const supabase = await createClient();
  const { data: engagements } = await supabase
    .from("engagements")
    .select("id, date, status, archived_at, clients(name)")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .limit(200);

  const rows = engagements ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Archived immersion days</h1>
        <p className="mt-1 text-sm text-slate">
          Deleted immersion days land here instead of being removed outright.
          Restoring one puts it straight back on the everyday list.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface p-10 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken text-slate">
            <Archive className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm font-medium text-ink">Nothing archived</p>
          <p className="mt-1 text-sm text-slate">
            Immersion days you delete from the everyday list show up here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((engagement) => {
            const client = (engagement as unknown as { clients: { name: string } | null })
              .clients;
            return (
              <li
                key={engagement.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div>
                  <p className="font-medium text-ink">{client?.name ?? "Unnamed client"}</p>
                  <p className="mt-0.5 text-xs text-slate">
                    Immersion day{" "}
                    {new Date(`${engagement.date}T00:00:00Z`).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      timeZone: "UTC",
                    })}{" "}
                    &middot; archived{" "}
                    {new Date(engagement.archived_at!).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <RestoreEngagementButton engagementId={engagement.id} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
