import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/types/database";

/**
 * The 20/day cap. CLAUDE.md: UTC reset, enforced server-side against
 * usage_events, never trusted from the client.
 */
export const DAILY_LIMIT = 20;

export type Usage = {
  count: number;
  limit: number;
  remaining: number;
  /** Next UTC midnight, as an ISO string the client can format locally. */
  resetAt: string;
};

/** Today's UTC calendar date, matching what the increment function writes. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextUtcMidnight(): string {
  const now = new Date();
  const reset = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return reset.toISOString();
}

/**
 * Reads today's count. Safe to call with the RLS-scoped client: consultants
 * can already read their own usage_events row (0001's
 * usage_events_select_own_or_admin policy), so this needs no elevated access.
 */
export async function getUsage(
  supabase: SupabaseClient<Database, "compass">,
  userId: string,
): Promise<Usage> {
  const { data } = await supabase
    .from("usage_events")
    .select("count")
    .eq("user_id", userId)
    .eq("date", todayUtc())
    .maybeSingle();

  const count = data?.count ?? 0;
  return {
    count,
    limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - count),
    resetAt: nextUtcMidnight(),
  };
}

/**
 * Consumes one question for today, atomically, and reports the resulting
 * usage. Requires the service role: usage_events has no write policy at all,
 * by design, so this is the only path that can move the count.
 */
export async function consumeUsage(userId: string): Promise<Usage> {
  const admin = createAdminClient();
  const { data: newCount, error } = await admin.rpc("increment_daily_usage", {
    p_user_id: userId,
  });

  if (error || typeof newCount !== "number") {
    throw new Error(
      `Could not record usage: ${error?.message ?? "no count returned"}`,
    );
  }

  return {
    count: newCount,
    limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - newCount),
    resetAt: nextUtcMidnight(),
  };
}
