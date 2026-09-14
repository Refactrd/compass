"use client";

import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The visible half of the 20/day cap. CLAUDE.md calls for this explicitly: a
 * persistent counter, not just a message that appears once the limit is hit.
 *
 * Local time for the reset clock, computed from the UTC instant the server
 * sent. The cap resets at UTC midnight regardless of what this displays; a
 * consultant should not have to do the timezone arithmetic themselves.
 */
export function UsageCounter({
  count,
  limit,
  resetAt,
}: {
  count: number;
  limit: number;
  resetAt: string;
}) {
  const atLimit = count >= limit;
  const resetLabel = new Date(resetAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <p
      className={cn(
        "flex items-center justify-center gap-1.5 text-center text-xs",
        atLimit ? "font-medium text-danger" : "text-slate-light",
      )}
    >
      {atLimit ? (
        <>
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Daily limit reached. Resets at {resetLabel}.
        </>
      ) : (
        `${count} of ${limit} questions today`
      )}
    </p>
  );
}
