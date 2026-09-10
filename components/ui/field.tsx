import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-slate">{hint}</p> : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "w-full rounded-md border border-border-strong bg-surface px-3 py-2",
        "text-sm text-ink placeholder:text-slate-light",
        "focus:border-brass focus:outline-none",
        "disabled:bg-surface-sunken disabled:text-slate",
        className,
      )}
      {...props}
    />
  );
}
