"use client";

import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Filter and pagination state lives in the URL rather than component state.
 *
 * That makes a filtered view shareable and survivable across a refresh, and it
 * means the page stays a server component doing the querying, instead of
 * shipping the whole document list to the browser to filter locally.
 */
function useParamWriter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const write = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    // Any change to a filter invalidates the page number.
    if (!("page" in updates)) next.delete("page");

    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  };

  return { write, pending, searchParams };
}

const SELECT_CLASS =
  "rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-brass focus:outline-none";

export function TableControls({
  statusOptions,
  sortOptions,
  searchPlaceholder,
}: {
  statusOptions: { value: string; label: string }[];
  sortOptions: { value: string; label: string }[];
  searchPlaceholder: string;
}) {
  const { write, pending, searchParams } = useParamWriter();
  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adjusting state during render, the documented way to resync when an
  // external value changes. Fires when the URL moves without the box being
  // typed in: the Clear button, or a back navigation.
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    setQuery(urlQuery);
  }

  // Debounced imperatively rather than in an effect, so typing does not fire a
  // query per keystroke and the timer does not restart on unrelated renders.
  const onSearchChange = (value: string) => {
    setQuery(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => write({ q: value || null }), 300);
  };

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    [],
  );

  const status = searchParams.get("status") ?? "all";
  const sort = searchParams.get("sort") ?? "newest";
  const filtered = urlQuery !== "" || status !== "all" || sort !== "newest";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 transition-opacity",
        pending && "opacity-60",
      )}
    >
      <div className="relative min-w-56 flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-light"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="w-full rounded-md border border-border-strong bg-surface py-1.5 pr-3 pl-8 text-sm text-ink placeholder:text-slate-light focus:border-brass focus:outline-none"
        />
      </div>

      <select
        value={status}
        onChange={(event) => write({ status: event.target.value })}
        aria-label="Filter by status"
        className={SELECT_CLASS}
      >
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <select
        value={sort}
        onChange={(event) => write({ sort: event.target.value })}
        aria-label="Sort order"
        className={SELECT_CLASS}
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {filtered ? (
        <Button
          variant="ghost"
          className="px-2.5 py-1.5 text-xs"
          onClick={() => write({ q: null, status: null, sort: null })}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Clear
        </Button>
      ) : null}
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  from,
  to,
  noun,
}: {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  noun: string;
}) {
  const { write, pending } = useParamWriter();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate" aria-live="polite">
        {total === 0
          ? `No ${noun}`
          : `Showing ${from} to ${to} of ${total} ${noun}`}
      </p>

      {pageCount > 1 ? (
        <div
          className={cn(
            "flex items-center gap-1.5 transition-opacity",
            pending && "opacity-60",
          )}
        >
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            disabled={page <= 1}
            onClick={() => write({ page: String(page - 1) })}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Previous
          </Button>
          <span className="px-1 text-xs tabular-nums text-slate">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            disabled={page >= pageCount}
            onClick={() => write({ page: String(page + 1) })}
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
