import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Inline message for form errors and confirmations. Deliberately plain — the
 * four MVP error states are meant to say what happened in a sentence, not
 * decorate it (CLAUDE.md, "MVP scope").
 */
export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        tone === "error"
          ? "border-danger/25 bg-danger-tint text-danger"
          : "border-border bg-surface-sunken text-ink-muted",
      )}
    >
      {children}
    </p>
  );
}
