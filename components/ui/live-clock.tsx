"use client";

import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";

/**
 * Date and time in the viewer's own locale and timezone.
 *
 * Resolves after hydration (see useNow). The reserved inline height keeps the
 * layout from shifting when the real value arrives.
 */
export function LiveClock({
  className,
  showDate = true,
}: {
  className?: string;
  showDate?: boolean;
}) {
  const now = useNow();

  return (
    <span className={cn("tabular-nums", className)}>
      {now ? (
        <>
          {showDate ? (
            <>
              {now.toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              <span className="mx-1.5 text-slate-light">/</span>
            </>
          ) : null}
          {now.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </>
      ) : (
        <span className="inline-block h-[1em]" aria-hidden="true" />
      )}
    </span>
  );
}
