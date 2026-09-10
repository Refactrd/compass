import Link from "next/link";

import { Button } from "@/components/ui/button";
import { LiveClock } from "@/components/ui/live-clock";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { SessionProfile } from "@/lib/supabase/server";
import type { Theme } from "@/lib/theme";

/**
 * Shared top bar for authenticated views, in both the consultant workspace and
 * the admin dashboard.
 *
 * The admin link is rendered only for admins. Admin controls are never shown to
 * consultants at all, rather than shown and refused
 * (docs/system-design.md section 7).
 */
export function AppHeader({
  profile,
  theme,
  context,
}: {
  profile: SessionProfile;
  theme: Theme;
  context: "workspace" | "admin";
}) {
  const navLink = (active: boolean) =>
    active
      ? "rounded-md px-2.5 py-1 text-sm font-medium text-ink"
      : "rounded-md px-2.5 py-1 text-sm text-slate transition-colors hover:text-ink";

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-5 px-6 py-3">
        <Link href="/" aria-label="Compass home" className="shrink-0">
          <Logo width={112} />
        </Link>

        {profile.role === "admin" ? (
          <nav className="flex items-center gap-1">
            <Link href="/" className={navLink(context === "workspace")}>
              Workspace
            </Link>
            <Link href="/admin" className={navLink(context === "admin")}>
              Admin
            </Link>
          </nav>
        ) : null}

        <div className="ml-auto flex items-center gap-4">
          <LiveClock className="hidden text-xs text-slate xl:inline" />

          <ThemeToggle theme={theme} />

          <div className="flex items-center gap-2 border-l border-border pl-4">
            <span className="hidden text-sm text-slate lg:inline">
              {profile.email}
            </span>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="ghost" className="px-2.5 py-1">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}
