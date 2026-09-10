"use client";

import { Lightbulb, Sparkles } from "lucide-react";

import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";
import {
  STARTING_POINTS,
  tipForDay,
  workspaceGreeting,
} from "@/lib/copy/workspace";

/**
 * The empty conversation.
 *
 * Sits above the composer rather than replacing it, so the thing you came to do
 * is always in the same place whether the thread is empty or fifty turns deep.
 *
 * The greeting resolves after hydration, like everything else clock-dependent:
 * the server cannot know the viewer's local hour. The reserved height keeps the
 * composer from jumping when the real greeting lands.
 */
export function WorkspaceHome({
  email,
  onPick,
  className,
}: {
  email: string;
  onPick: (prompt: string) => void;
  className?: string;
}) {
  const now = useNow();
  const greeting = now ? workspaceGreeting(now, email) : null;
  const tip = now ? tipForDay(now) : null;

  return (
    <div className={cn("flex flex-col items-center justify-center px-2 text-center", className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brass-tint text-brass-strong">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className="mt-4 min-h-20">
        <h1 className="font-display text-3xl leading-tight font-bold text-balance text-ink">
          {greeting?.headline ?? "Welcome back"}
        </h1>
        <p className="mt-1.5 text-sm text-slate">
          {greeting?.sub ?? "What are we working on?"}
        </p>
      </div>

      <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
        {STARTING_POINTS.map((point) => (
          <button
            key={point.label}
            type="button"
            onClick={() => onPick(point.prompt)}
            className="group rounded-xl border border-border bg-surface p-3.5 text-left transition-colors hover:border-border-strong hover:bg-surface-sunken"
          >
            <span className="block text-sm font-medium text-ink">
              {point.label}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-slate line-clamp-2">
              {point.prompt}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-8 flex max-w-lg items-start gap-2 text-left text-xs leading-relaxed text-slate">
        <Lightbulb
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brass-strong"
          aria-hidden="true"
        />
        <span className="min-h-8">{tip ?? ""}</span>
      </p>
    </div>
  );
}
