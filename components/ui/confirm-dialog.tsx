"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

/**
 * Destructive confirmation, in a real modal.
 *
 * Previously this expanded inline inside the table cell, which tripled the row
 * height and pushed every row below it down the page. A dialog keeps the table
 * still and puts the warning where the eye already is.
 *
 * Uses the native <dialog> element rather than a library: the browser gives
 * focus trapping, Escape to close, inert background and correct ARIA for free.
 *
 * The typed confirmation is the guard against deleting the wrong row from a
 * table where every row looks alike. The server re-checks it regardless.
 */
export function ConfirmDialog({
  open,
  onClose,
  action,
  heading,
  description,
  confirmValue,
  confirmLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  action: (formData: FormData) => void;
  heading: string;
  description: React.ReactNode;
  /** Typed back by the user to enable the action. */
  confirmValue: string;
  confirmLabel: string;
  /** Hidden fields the action needs. */
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Fires on Escape and on backdrop dismissal, so parent state cannot drift
      // out of step with what is actually on screen.
      onClose={onClose}
      // text-left is explicit because a native dialog renders in the top layer
      // but still inherits CSS from its DOM parent, and this one lives inside a
      // right-aligned table cell.
      className="compass-dialog w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-left text-ink shadow-raised backdrop:bg-ink/40"
    >
      <form action={action} className="flex flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-tint text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold text-ink">
              {heading}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate">
              {description}
            </p>
          </div>
        </div>

        {children}

        <label className="mt-1 flex flex-col gap-1.5">
          <span className="text-xs text-slate">
            Type <span className="font-medium text-ink">{confirmValue}</span> to
            confirm
          </span>
          <Input name="confirm" autoComplete="off" required />
        </label>

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger">
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
