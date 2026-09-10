import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  // Brass carries the primary action. White text on #B08D57 clears 4.5:1.
  primary:
    "bg-brass text-white hover:bg-brass-strong disabled:bg-border disabled:text-slate-light disabled:hover:bg-border",
  secondary:
    "bg-surface text-ink border border-border-strong hover:bg-surface-sunken disabled:text-slate-light",
  ghost: "text-slate hover:bg-surface-sunken hover:text-ink",
  danger:
    "bg-surface text-danger border border-danger/30 hover:bg-danger-tint disabled:text-danger/50",
};

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2",
        "text-sm font-medium transition-colors",
        "disabled:cursor-not-allowed",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
