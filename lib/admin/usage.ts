import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

/**
 * Usage aggregation for the admin Usage section.
 *
 * CLAUDE.md: "per-consultant question counts, current week/month." Both
 * boundaries are UTC, matching the UTC reset the daily cap itself uses
 * elsewhere (lib/rate-limit.ts) — a consultant's "today" here is the same
 * calendar day their composer counter is counting against.
 *
 * Reads through the RLS-scoped client, not the service role. usage_events'
 * select policy already names admins explicitly
 * (usage_events_select_own_or_admin), so RLS is what actually grants the
 * cross-user read here, not an application-level role check standing in
 * front of a client that could see everything regardless.
 */

const CHART_DAYS = 31;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type UsageBounds = {
  today: string;
  /** Monday this week, UTC. */
  weekStart: string;
  /** The 1st of this month, UTC. */
  monthStart: string;
  /** Earliest date the chart query needs; always covers monthStart. */
  chartStart: string;
};

export function usageBounds(now = new Date()): UsageBounds {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  // ISO week: Monday start. getUTCDay() is 0=Sunday, so Sunday needs the
  // extra 6-day pull back rather than the usual (day - 1).
  const dow = now.getUTCDay();
  const backToMonday = dow === 0 ? 6 : dow - 1;
  const weekStart = new Date(Date.UTC(y, m, d - backToMonday));

  const monthStart = new Date(Date.UTC(y, m, 1));

  // CHART_DAYS trailing days, but never later than the 1st of the month: a
  // month-to-date total must always be fully covered by the same window the
  // chart query uses, or the two would silently disagree on early-month days.
  const trailing = new Date(Date.UTC(y, m, d - (CHART_DAYS - 1)));
  const chartStart = trailing < monthStart ? trailing : monthStart;

  return {
    today: isoDate(now),
    weekStart: isoDate(weekStart),
    monthStart: isoDate(monthStart),
    chartStart: isoDate(chartStart),
  };
}

export type ConsultantUsage = {
  userId: string;
  email: string;
  role: "admin" | "consultant";
  status: "invited" | "active" | "disabled";
  today: number;
  week: number;
  month: number;
};

export type UsageReport = {
  bounds: UsageBounds;
  totals: { today: number; week: number; month: number };
  activeConsultants: number;
  /** One point per calendar day from chartStart to today, zero-filled. */
  daily: { date: string; count: number }[];
  perConsultant: ConsultantUsage[];
};

export async function buildUsageReport(
  supabase: SupabaseClient<Database, "compass">,
  now = new Date(),
): Promise<UsageReport> {
  const bounds = usageBounds(now);

  const [{ data: events }, { data: users }] = await Promise.all([
    supabase
      .from("usage_events")
      .select("user_id, date, count")
      .gte("date", bounds.chartStart),
    supabase.from("users").select("id, email, role, status"),
  ]);

  const rows = events ?? [];
  const roster = users ?? [];

  const dailyMap = new Map<string, number>();
  for (
    let cursor = new Date(`${bounds.chartStart}T00:00:00Z`);
    isoDate(cursor) <= bounds.today;
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    dailyMap.set(isoDate(cursor), 0);
  }

  const perUser = new Map(
    roster.map((u) => [
      u.id,
      { today: 0, week: 0, month: 0 },
    ]),
  );

  let totalToday = 0;
  let totalWeek = 0;
  let totalMonth = 0;

  for (const row of rows) {
    if (dailyMap.has(row.date)) {
      dailyMap.set(row.date, (dailyMap.get(row.date) ?? 0) + row.count);
    }

    const bucket = perUser.get(row.user_id);
    if (row.date >= bounds.monthStart) {
      totalMonth += row.count;
      if (bucket) bucket.month += row.count;
    }
    if (row.date >= bounds.weekStart) {
      totalWeek += row.count;
      if (bucket) bucket.week += row.count;
    }
    if (row.date === bounds.today) {
      totalToday += row.count;
      if (bucket) bucket.today += row.count;
    }
  }

  const perConsultant: ConsultantUsage[] = roster
    .map((u) => {
      const usage = perUser.get(u.id) ?? { today: 0, week: 0, month: 0 };
      return { userId: u.id, email: u.email, role: u.role, status: u.status, ...usage };
    })
    // Most active this month first, so the people actually using Compass are
    // what the admin sees without scrolling.
    .sort((a, b) => b.month - a.month || a.email.localeCompare(b.email));

  return {
    bounds,
    totals: { today: totalToday, week: totalWeek, month: totalMonth },
    activeConsultants: perConsultant.filter((c) => c.week > 0).length,
    daily: [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count })),
    perConsultant,
  };
}
