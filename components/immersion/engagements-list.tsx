"use client";

import { Briefcase, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ArchiveEngagementButton } from "@/components/immersion/archive-engagement-button";
import { cn } from "@/lib/utils";

export type EngagementRow = {
  id: string;
  date: string;
  status: string;
  clientName: string;
  departmentTotal: number;
  departmentDone: number;
};

/**
 * Client-side search, same reasoning as ConversationSidebar's: this is every
 * active member's engagements, not one consultant's, but still a short list
 * at this business's actual scale, so filtering here beats a round trip per
 * keystroke.
 */
export function EngagementsList({
  rows,
  isAdmin,
}: {
  rows: EngagementRow[];
  isAdmin: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.clientName.toLowerCase().includes(needle));
  }, [rows, query]);

  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 ? (
        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-3 h-4 w-4 text-slate-light"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by company"
            aria-label="Search immersion days by company"
            className="w-full rounded-lg border border-border bg-surface py-2 pr-3 pl-9 text-sm text-ink placeholder:text-slate-light focus:border-border-strong focus:outline-none"
          />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface p-10 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken text-slate">
            <Briefcase className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm font-medium text-ink">No immersion days yet</p>
          <p className="mt-1 text-sm text-slate">
            Start one to work through a client&apos;s departments live onsite.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-1 py-6 text-sm text-slate">
          No company matches {`"${query}"`}.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((engagement) => (
            <li
              key={engagement.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 hover:border-border-strong"
            >
              <Link
                href={`/engagements/${engagement.id}`}
                className="flex flex-1 items-center justify-between gap-3"
              >
                <div>
                  <p className="font-medium text-ink">{engagement.clientName}</p>
                  <p className="mt-0.5 text-xs text-slate">
                    {new Date(`${engagement.date}T00:00:00Z`).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      timeZone: "UTC",
                    })}{" "}
                    &middot; {engagement.departmentDone} of {engagement.departmentTotal} department
                    {engagement.departmentTotal === 1 ? "" : "s"} done
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-xs font-medium capitalize",
                    engagement.status === "complete"
                      ? "border-brass/30 bg-brass-tint text-brass-strong"
                      : "border-border-strong bg-surface-sunken text-slate",
                  )}
                >
                  {engagement.status === "complete" ? "Complete" : "In progress"}
                </span>
              </Link>
              {isAdmin ? (
                <ArchiveEngagementButton
                  engagementId={engagement.id}
                  clientName={engagement.clientName}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
