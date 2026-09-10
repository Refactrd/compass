import { InviteForm } from "@/components/admin/invite-form";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { UserRowActions } from "@/components/admin/user-row-actions";
import { requireActiveAdmin } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata = { title: "Users · Compass admin" };

const DAILY_LIMIT = 20;

const STATUS_STYLES = {
  active: "border-brass/30 bg-brass-tint text-brass-strong",
  invited: "border-border-strong bg-surface-sunken text-slate",
  disabled: "border-danger/25 bg-danger-tint text-danger",
} as const;

export default async function AdminUsersPage() {
  const caller = await requireActiveAdmin();

  // Service role: this page must see every account, which RLS deliberately
  // prevents the signed-in user from doing. The layout has already established
  // that the caller is an active admin.
  const admin = createAdminClient();

  // UTC, matching the reset boundary the daily cap uses.
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: users }, { data: usage }] = await Promise.all([
    admin
      .from("users")
      .select("id, email, role, status, created_at")
      .order("created_at", { ascending: true }),
    admin.from("usage_events").select("user_id, count").eq("date", today),
  ]);

  const roster = users ?? [];
  const questionsToday = new Map(
    (usage ?? []).map((row) => [row.user_id, row.count]),
  );

  const activeCount = roster.filter((u) => u.status === "active").length;
  const invitedCount = roster.filter((u) => u.status === "invited").length;
  const askedToday = (usage ?? []).reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        description="Invite consultants, disable or delete accounts, and see how many questions each has asked today. There is no seat limit."
        action={<InviteForm />}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Active" value={activeCount} hint="Can sign in today" />
        <StatCard
          label="Awaiting setup"
          value={invitedCount}
          hint="Invited, password not set"
        />
        <StatCard
          label="Questions today"
          value={askedToday}
          hint="Across everyone, resets at UTC midnight"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-xs font-semibold tracking-[0.08em] text-slate uppercase">
                  Email
                </th>
                <th className="px-4 py-3 text-xs font-semibold tracking-[0.08em] text-slate uppercase">
                  Role
                </th>
                <th className="px-4 py-3 text-xs font-semibold tracking-[0.08em] text-slate uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-semibold tracking-[0.08em] text-slate uppercase">
                  Today
                </th>
                <th className="px-4 py-3 text-xs font-semibold tracking-[0.08em] text-slate uppercase">
                  Added
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {roster.map((user) => {
                const asked = questionsToday.get(user.id) ?? 0;
                return (
                  <tr
                    key={user.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-4 py-3 font-medium text-ink">
                      {user.email}
                    </td>
                    <td className="px-4 py-3 text-slate capitalize">
                      {user.role}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-block rounded-md border px-2 py-0.5 text-xs font-medium capitalize",
                          STATUS_STYLES[user.status],
                        )}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate tabular-nums">
                      {asked} of {DAILY_LIMIT}
                    </td>
                    <td className="px-4 py-3 text-slate tabular-nums">
                      {new Date(user.created_at).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <UserRowActions
                        userId={user.id}
                        email={user.email}
                        status={user.status}
                        isSelf={user.id === caller.id}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-slate-light">
        Disabling an account revokes its session immediately and blocks sign in.
        Deleting also removes that person&rsquo;s conversations, which cannot be
        undone. Client records are shared and survive either action.
      </p>
    </div>
  );
}
