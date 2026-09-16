import { NextResponse, type NextRequest } from "next/server";

import { cronSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Keeps the Supabase project off the hobby tier's auto-pause, which triggers
 * after 7 days with no database activity. Vercel Cron hits this once a day
 * (see vercel.json), which is both the minimum Supabase needs and the most
 * frequent a Cron Job can run on Vercel's own hobby plan, so the two limits
 * line up without needing a paid tier on either side.
 *
 * A real write, not a read: some reports suggest Supabase's inactivity check
 * only reliably resets on genuine write traffic, not a PostgREST select, so
 * this upserts a counter rather than just pinging with a query that returns
 * nothing changed.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret()}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: current } = await admin
    .from("cron_heartbeat")
    .select("ping_count")
    .eq("id", true)
    .single();

  const { error } = await admin
    .from("cron_heartbeat")
    .update({
      ping_count: (current?.ping_count ?? 0) + 1,
      last_pinged_at: new Date().toISOString(),
    })
    .eq("id", true);

  if (error) {
    console.error("[cron/keep-alive] heartbeat write failed", error);
    return NextResponse.json({ error: "Heartbeat write failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() });
}
