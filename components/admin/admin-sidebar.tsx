"use client";

import { BarChart3, FileText, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { LiveClock } from "@/components/ui/live-clock";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { SessionProfile } from "@/lib/supabase/server";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const SECTIONS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/admin/users", label: "Users", Icon: Users },
  { href: "/admin/documents", label: "Documents", Icon: FileText },
  { href: "/admin/usage", label: "Usage", Icon: BarChart3 },
];

/**
 * Admin navigation rail.
 *
 * A labelled sidebar rather than the icon-only rail some of the reference
 * dashboards use: with three destinations, icons alone would be a guessing
 * game, and the labels cost nothing at this width.
 *
 * Client side purely for `usePathname`, which drives the active state.
 */
export function AdminSidebar({
  profile,
  theme,
}: {
  profile: SessionProfile;
  theme: Theme;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex shrink-0 flex-col border-b border-border bg-surface lg:h-dvh lg:w-60 lg:border-r lg:border-b-0">
      <div className="flex items-center gap-3 px-5 py-4">
        <Link href="/admin" aria-label="Compass admin">
          <Logo width={104} />
        </Link>
        <span className="rounded-md bg-brass-tint px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-[0.12em] text-brass-strong uppercase">
          Admin
        </span>
      </div>

      <nav className="flex gap-1 px-3 pb-3 lg:flex-1 lg:flex-col lg:pb-0">
        {SECTIONS.map((section) => {
          const active = pathname.startsWith(section.href);
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-surface-sunken font-medium text-ink"
                  : "text-slate hover:bg-surface-sunken hover:text-ink",
              )}
            >
              <section.Icon
                className={cn(
                  "h-4 w-4",
                  active ? "text-brass-strong" : "text-slate-light",
                )}
                aria-hidden="true"
              />
              {section.label}
            </Link>
          );
        })}
      </nav>

      <div className="hidden flex-col gap-3 border-t border-border px-5 py-4 lg:flex">
        <Link
          href="/"
          className="text-xs text-slate transition-colors hover:text-ink"
        >
          Back to workspace
        </Link>

        <p className="text-xs text-slate-light">
          <LiveClock />
        </p>

        <ThemeToggle theme={theme} compact />

        <div className="border-t border-border pt-3">
          <p className="truncate text-xs font-medium text-ink" title={profile.email}>
            {profile.email}
          </p>
          <form action="/auth/signout" method="post" className="mt-1.5">
            <Button type="submit" variant="ghost" className="px-0 py-0 text-xs">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </aside>
  );
}
