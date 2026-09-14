import { PageHeader, StatCard } from "@/components/admin/page-header";
import { UsageChart } from "@/components/admin/usage-chart";
import { requireActiveAdmin } from "@/lib/auth/guards";
import { buildUsageReport } from "@/lib/admin/usage";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Usage · Compass admin" };

const DAILY_LIMIT = 20;

const STATUS_STYLES = {
  active: "border-brass/30 bg-brass-tint text-brass-strong",
  invited: "border-border-strong bg-surface-sunken text-slate",
  disabled: "border-danger/25 bg-danger-tint text-danger",
} as const;

/**
 * Where a chart earns its place over a table: the daily trend is genuinely
 * easier to read as bars than as a column of numbers (docs/system-design.md
 * §7). The precise figures CLAUDE.md actually asks for — per-consultant
 * today/week/month — stay in the table below it, so nothing on this page is
 * reachable only by hovering a bar.
 */
export default async function AdminUsagePage() {
  await requireActiveAdmin();

  // RLS-scoped, not the service role: usage_events and users both name
  // admins explicitly in their select policies, so an active admin session
  // can already read every row. That is what is actually granting the
  // cross-user read here, not an application check standing in front of a
  // client that could see everything regardless of who is signed in.
  const supabase = await createClient();
  const report = await buildUsageReport(supabase);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usage"
        description="Questions asked, per consultant and over time. The daily cap is 20 per person, UTC reset."
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label="Today"
          value={report.totals.today}
          hint="Across everyone, resets at UTC midnight"
        />
        <StatCard
          label="This week"
          value={report.totals.week}
          hint={`Since Monday, UTC (from ${report.bounds.weekStart})`}
        />
        <StatCard
          label="This month"
          value={report.totals.month}
          hint={`Month to date, UTC (from ${report.bounds.monthStart})`}
        />
        <StatCard
          label="Active this week"
          value={report.activeConsultants}
          hint="Consultants who asked at least one question"
        />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-medium text-ink">Questions per day</h2>
        <p className="mt-0.5 text-xs text-slate">
          Trailing month, every consultant combined.
        </p>
        <div className="mt-4">
          <UsageChart data={report.daily} />
        </div>
      </div>

      {report.perConsultant.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface p-10 text-center">
          <h2 className="font-display text-lg font-semibold text-ink">
            No consultants yet
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate">
            Usage appears here once someone has an account. Invite consultants
            from the Users section.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Consultant</Th>
                  <Th>Status</Th>
                  <Th align="right">Today</Th>
                  <Th align="right">This week</Th>
                  <Th align="right">This month</Th>
                </tr>
              </thead>
              <tbody>
                {report.perConsultant.map((row) => (
                  <tr
                    key={row.userId}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{row.email}</p>
                      <p className="text-xs text-slate capitalize">{row.role}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-block rounded-md border px-2 py-0.5 text-xs font-medium capitalize",
                          STATUS_STYLES[row.status],
                        )}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate tabular-nums">
                      {row.today} of {DAILY_LIMIT}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-ink tabular-nums">
                      {row.week}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-ink tabular-nums">
                      {row.month}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-semibold tracking-[0.08em] text-slate uppercase",
        align === "right" && "text-right",
      )}
    >
      {children}
    </th>
  );
}
