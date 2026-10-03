import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

import type { Database } from "@/lib/types/database";
import type { UserRole, UserStatus } from "@/lib/types/database";

/**
 * Supabase client for server components, server actions and route handlers.
 * Runs as the signed-in user, so RLS still applies — this is the default client
 * for server-side data access, not the admin one.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database, "compass">(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      db: { schema: "compass" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a server component, where cookies are read-only.
            // middleware.ts refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}

export type SessionProfile = {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  /** ISO timestamp: when the session Supabase Auth time-boxes to 3 days
   * (set in the Supabase dashboard, Authentication -> Sessions) actually
   * runs out. Computed from auth.users.last_sign_in_at, which only moves on
   * a real sign-in event, not on each silent token refresh, so it is a
   * stable anchor for "when did this session begin." Null if last_sign_in_at
   * is somehow unavailable. Drives components/ui/session-expiry-banner.tsx. */
  sessionExpiresAt: string | null;
};

/**
 * The signed-in user's row from public.users, or null if there is no session.
 *
 * Always read the role from the database rather than from JWT claims: an admin
 * demoting or disabling someone must take effect on their next request, not
 * whenever their token happens to expire.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, role, status")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return { ...profile, sessionExpiresAt: sessionExpiresAt(user.last_sign_in_at) };
}

const SESSION_TIMEBOX_MS = 3 * 24 * 60 * 60 * 1000;

/** Shared with lib/auth/guards.ts's own profile load, which is the path
 * every real page actually goes through; this export keeps both in sync. */
export function sessionExpiresAt(lastSignInAt: string | null | undefined): string | null {
  if (!lastSignInAt) return null;
  return new Date(new Date(lastSignInAt).getTime() + SESSION_TIMEBOX_MS).toISOString();
}
