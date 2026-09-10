"use client";

import { BookOpen, ChevronDown, FileText } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * What an answer drew on.
 *
 * Collapsed to a count by default, because the source list is a thing you check
 * when you want to check it, not something to read past on every turn.
 *
 * The unsourced case is shown rather than hidden. An answer with no sources
 * looks identical to one with sources unless we say so, and the whole grounding
 * discipline depends on that difference being visible.
 */
export function MessageSources({ titles }: { titles: string[] }) {
  const [open, setOpen] = useState(false);

  if (titles.length === 0) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-light">
        <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
        No Refactrd material matched this question. Answered from methodology
        alone.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs text-slate transition-colors hover:text-ink"
      >
        <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
        {titles.length} source{titles.length === 1 ? "" : "s"}
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <ul className="mt-2 flex flex-col gap-1.5 border-l border-border pl-3">
          {titles.map((title) => (
            <li
              key={title}
              className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-muted"
            >
              <FileText
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-light"
                aria-hidden="true"
              />
              {title}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
