"use client";

import { Clock } from "lucide-react";
import { usePathname } from "next/navigation";

import { useNow } from "@/lib/hooks/use-now";

/** Below this, worth a heads-up; above it, not worth the visual noise on
 * every page for three days straight. */
const WARNING_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Heads-up before the 3-day time-boxed session (Supabase dashboard,
 * Authentication -> Sessions) ends.
 *
 * Purely a courtesy: nothing here actually prevents the timeout, and nothing
 * needs to. Every immersion day and chat write already autosaves to Postgres
 * as it happens (CLAUDE.md's autosave-per-department non-negotiable, and the
 * transcript-draft autosave alongside it), and proxy.ts already appends
 * `next=<path>` to the forced redirect to /login, which signIn() now honours,
 * so a session that actually expires mid-task loses nothing and returns the
 * consultant to the exact page once they sign back in. This just means they
 * are not surprised by it.
 */
export function SessionExpiryBanner({ expiresAt }: { expiresAt: string | null }) {
  const now = useNow();
  const pathname = usePathname();

  if (!expiresAt || !now) return null;

  const remainingMs = new Date(expiresAt).getTime() - now.getTime();
  if (remainingMs <= 0 || remainingMs > WARNING_WINDOW_MS) return null;

  const remainingLabel =
    remainingMs < 60 * 60 * 1000
      ? "less than an hour"
      : `about ${Math.round(remainingMs / (60 * 60 * 1000))} hour${
          Math.round(remainingMs / (60 * 60 * 1000)) === 1 ? "" : "s"
        }`;

  return (
    <div className="flex items-center gap-2 border-b border-brass/30 bg-brass-tint px-4 py-2 text-xs text-brass-strong">
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        Your session ends in {remainingLabel}. Nothing here is lost when it
        does, you will just need to sign in again.
      </span>
      {/* Signs out first, not a plain link to /login: proxy.ts bounces an
          already-authenticated visit to /login straight back to "/", so
          actually refreshing the session early has to end the current one. */}
      <form action={`/auth/signout?next=${encodeURIComponent(pathname)}`} method="post" className="ml-auto shrink-0">
        <button type="submit" className="font-medium underline underline-offset-2">
          Sign in again now
        </button>
      </form>
    </div>
  );
}
