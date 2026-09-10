"use client";

import { Check, X } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { setPassword } from "@/app/login/actions";
import type { AuthState } from "@/app/login/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import {
  MIN_LENGTH,
  scorePassword,
  validatePasswords,
} from "@/lib/password-strength";
import { cn } from "@/lib/utils";

const BAR_COLOURS = [
  "bg-danger",
  "bg-danger",
  "bg-brass",
  "bg-brass-strong",
  "bg-brass-strong",
];

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} className="mt-1 w-full">
      {pending ? "Setting your password…" : "Set password and continue"}
    </Button>
  );
}

/**
 * Password setup with live feedback.
 *
 * Validation is shown as you type rather than only on submit, because the
 * failure modes here are the two things you can only find out by trying: too
 * short, and the two fields not matching. Making someone submit to learn that
 * wastes a round trip on the one screen they cannot skip.
 *
 * The server re-checks both. Nothing here is a security control; it is entirely
 * about not making the person guess.
 */
export function SetPasswordForm({ email }: { email: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(
    setPassword,
    null,
  );
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touchedConfirm, setTouchedConfirm] = useState(false);

  const strength = scorePassword(password);
  const problem = validatePasswords(password, confirm);
  const longEnough = password.length >= MIN_LENGTH;
  const matches = confirm.length > 0 && password === confirm;
  const blocked = !longEnough || !matches;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="email" value={email} readOnly />

      <Field label="New password" htmlFor="password">
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onValueChange={setPasswordValue}
          required
        />
      </Field>

      {password ? (
        <div aria-live="polite">
          <div className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((segment) => (
              <span
                key={segment}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  segment < strength.level
                    ? BAR_COLOURS[strength.level]
                    : "bg-border",
                )}
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate">
            <span className="font-medium text-ink">{strength.label}</span>
            {strength.advice ? `. ${strength.advice}` : ""}
          </p>
        </div>
      ) : null}

      <Field label="Confirm password" htmlFor="confirm">
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          value={confirm}
          onValueChange={(value) => {
            setConfirm(value);
            setTouchedConfirm(true);
          }}
          required
        />
      </Field>

      <ul className="flex flex-col gap-1.5 text-xs">
        <Requirement met={longEnough}>
          At least {MIN_LENGTH} characters
        </Requirement>
        <Requirement met={matches} pending={!touchedConfirm}>
          Both fields match
        </Requirement>
      </ul>

      {/* Server-side failures: an expired link, or a rule the browser cannot
          know about such as the provider rejecting a breached password. */}
      {state && "error" in state ? <Alert>{state.error}</Alert> : null}

      {problem === "mismatch" && touchedConfirm ? (
        <Alert>Those two passwords do not match.</Alert>
      ) : null}

      <Submit disabled={blocked} />
    </form>
  );
}

function Requirement({
  met,
  pending = false,
  children,
}: {
  met: boolean;
  pending?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-1.5",
        pending ? "text-slate-light" : met ? "text-brass-strong" : "text-slate",
      )}
    >
      {met ? (
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <X
          className={cn("h-3.5 w-3.5 shrink-0", pending && "opacity-40")}
          aria-hidden="true"
        />
      )}
      {children}
      <span className="sr-only">{met ? " (met)" : " (not yet met)"}</span>
    </li>
  );
}
