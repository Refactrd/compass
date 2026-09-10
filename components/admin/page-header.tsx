import type { ReactNode } from "react";

/**
 * Title, one line of context, and the section's primary action on the right.
 * The pattern the reference dashboards share, and the thing the old admin
 * screen was missing.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-slate">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium tracking-[0.08em] text-slate uppercase">
        {label}
      </p>
      <p className="font-display mt-2 text-2xl font-bold text-ink tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-light">{hint}</p> : null}
    </div>
  );
}
