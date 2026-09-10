import Link from "next/link";
import type { ReactNode } from "react";

import { Showcase } from "@/components/auth/showcase";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { Theme } from "@/lib/theme";

/**
 * Frame for the unauthenticated screens: form on the left, image panel on the
 * right, following the arrangement of the reference sign-in screen.
 *
 * Below 1024px the panel is dropped entirely rather than stacked. On a laptop
 * or a phone a decorative image above a login form is just something to scroll
 * past before doing the thing you came to do.
 *
 * `greeting` is the time-aware heading, passed in so that only the screens that
 * want it pay for a client component.
 */
export function AuthShell({
  theme,
  greeting,
  title,
  intro,
  children,
  footer,
}: {
  theme: Theme;
  greeting?: ReactNode;
  title?: string;
  intro?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col p-3 lg:p-4">
      <div className="grid flex-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col">
          <header className="px-3 py-2 lg:px-6">
            <Link href="/login" aria-label="Compass home">
              <Logo width={118} />
            </Link>
          </header>

          <main className="flex flex-1 items-center justify-center px-3 py-10 lg:px-6">
            <div className="w-full max-w-sm">
              {greeting ?? (
                <div>
                  <h1 className="font-display text-3xl leading-tight font-bold text-ink">
                    {title}
                  </h1>
                  {intro ? (
                    <p className="mt-2 text-sm leading-relaxed text-slate">
                      {intro}
                    </p>
                  ) : null}
                </div>
              )}

              {greeting && title ? (
                <div className="mt-8">
                  <h2 className="text-base font-semibold text-ink">{title}</h2>
                  {intro ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-slate">
                      {intro}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {children ? <div className="mt-6">{children}</div> : null}

              {footer ? (
                <div className="mt-6 border-t border-border pt-4 text-sm text-slate">
                  {footer}
                </div>
              ) : null}
            </div>
          </main>

          {/* Appearance sits down here rather than beside the wordmark: at the
              top it competed with the greeting, which is the thing the screen
              is actually leading with. */}
          <footer className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 lg:px-6">
            <p className="text-xs text-slate-light">
              Compass is an internal Refactrd tool. Access is by invitation.
            </p>
            <ThemeToggle theme={theme} />
          </footer>
        </div>

        <Showcase />
      </div>
    </div>
  );
}
