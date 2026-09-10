"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useOptimistic, useTransition } from "react";

import { setTheme } from "@/app/actions/theme";
import { cn } from "@/lib/utils";
import type { Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/**
 * Appearance control. Three states rather than a two-way switch, so "follow the
 * operating system" stays available instead of being an unrecoverable default.
 *
 * The optimistic value moves the selection immediately; the server action then
 * writes the cookie and revalidates, which is what actually repaints the page.
 */
export function ThemeToggle({
  theme,
  compact = false,
}: {
  theme: Theme;
  /** Icons only. The labelled form is wider than the admin sidebar. */
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(theme);

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={cn(
        "inline-flex w-fit items-center gap-0.5 rounded-lg border border-border bg-surface-sunken p-0.5",
        pending && "opacity-70",
      )}
    >
      {OPTIONS.map((option) => {
        const selected = optimistic === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={`${option.label} appearance`}
            onClick={() =>
              startTransition(async () => {
                setOptimistic(option.value);
                await setTheme(option.value);
              })
            }
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              selected
                ? "bg-surface text-ink shadow-subtle"
                : "text-slate hover:text-ink",
            )}
          >
            <option.Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className={compact ? "sr-only" : "sr-only sm:not-sr-only"}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
