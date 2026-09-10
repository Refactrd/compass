"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

import { Input } from "@/components/ui/field";

/**
 * Password field with a reveal toggle.
 *
 * Typing a 12 character password blind is where people give up, and masking
 * buys nothing against anyone who is not already looking at the screen. Default
 * stays masked; revealing is a deliberate act.
 *
 * The button is type="button" so it never submits the form. The icon is
 * decorative, with the real label on the button itself, plus a live region so
 * a screen reader user hears the state change rather than just the label.
 */
export function PasswordInput({
  id,
  name,
  autoComplete,
  minLength,
  required,
  value,
  onValueChange,
}: {
  id: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  required?: boolean;
  /** Controlled only when a caller needs to read the value, such as the
   *  strength meter. Left uncontrolled elsewhere. */
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const statusId = useId();
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        className="pr-11"
        aria-describedby={statusId}
        {...(onValueChange
          ? {
              value: value ?? "",
              onChange: (event) => onValueChange(event.target.value),
            }
          : {})}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-3 text-slate transition-colors hover:text-ink"
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </button>
      <span id={statusId} className="sr-only" aria-live="polite">
        {visible ? "Password is visible" : "Password is hidden"}
      </span>
    </div>
  );
}
