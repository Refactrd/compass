import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { SessionProfile } from "@/lib/supabase/server";

/**
 * Route guards for the two gated route groups.
 *
 * These read role and status from public.users on every request rather than
 * from a JWT claim. That is what makes an admin disabling someone take effect
 * on their next navigation instead of whenever their token happens to expire —
 * the "session revocation on disable" item on the readiness checklist.
 *
 * The database enforces the same boundaries underneath (see the RLS policies in
 * supabase/migrations). These guards exist to produce a sensible redirect, not
 * to be the security control.
 */
type ProfileResult =
  | { state: "anonymous" }
  | { state: "orphaned" }
  | { state: "found"; profile: SessionProfile };

async function loadProfile(): Promise<ProfileResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "anonymous" };

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, role, status")
    .eq("id", user.id)
    .single();

  // A valid session with no profile row: an auth user that predates the mirror
  // trigger, or whose row was deleted under an active session.
  //
  // This must NOT be treated as anonymous. The proxy sees a real session and
  // will not redirect to /login, so sending them there from here produces an
  // infinite bounce between /login and /. They get the no-account screen, which
  // has a sign-out button and is a public route.
  if (!profile) return { state: "orphaned" };

  return { state: "found", profile };
}

/** Requires an active account of any role. Used by the consultant workspace. */
export async function requireActiveMember(): Promise<SessionProfile> {
  const result = await loadProfile();
  if (result.state === "anonymous") redirect("/login");
  if (result.state === "orphaned") redirect("/access-revoked?reason=no-account");

  const { profile } = result;
  // Invited but never finished setting a password — send them to do that
  // rather than showing an access-revoked screen, which would be misleading.
  if (profile.status === "invited") redirect("/set-password");
  if (profile.status !== "active") redirect("/access-revoked");

  return profile;
}

/** Requires an active admin. Used by the admin dashboard. */
export async function requireActiveAdmin(): Promise<SessionProfile> {
  const profile = await requireActiveMember();
  // Consultants are sent to their own workspace, not shown a 403. Admin
  // controls are never rendered for them (docs/system-design.md §7).
  if (profile.role !== "admin") redirect("/");
  return profile;
}
