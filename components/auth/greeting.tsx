"use client";

import { LiveClock } from "@/components/ui/live-clock";
import { greetingFor } from "@/lib/copy/greetings";
import { useNow } from "@/lib/hooks/use-now";

/**
 * Time-aware greeting above the sign-in form.
 *
 * Depends on the viewer's local hour, so it resolves after hydration rather
 * than during SSR. The reserved block height keeps the form below from jumping
 * when the real greeting lands, and the band is re-evaluated on every tick, so
 * a tab left open overnight rolls into the next greeting on its own.
 */
export function Greeting() {
  const now = useNow();
  const greeting = now ? greetingFor(now) : null;

  return (
    <div className="min-h-21">
      <h1 className="font-display text-3xl leading-tight font-bold text-balance text-ink">
        {greeting?.headline ?? "Welcome back"}
      </h1>
      <p className="mt-1.5 text-sm text-slate">
        {greeting?.note ?? "Sign in to continue."}
      </p>
      <p className="mt-3 text-xs text-slate-light">
        <LiveClock />
      </p>
    </div>
  );
}
