"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AuthState } from "@/app/login/actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-1 w-full">
      {pending ? "Working…" : label}
    </Button>
  );
}

/**
 * Wraps the three auth forms so they share error rendering and pending state.
 * Fields are passed in as children; only the surrounding behaviour is shared.
 */
export function AuthForm({
  action,
  submitLabel,
  successMessage,
  children,
}: {
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  submitLabel: string;
  successMessage?: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState<AuthState, FormData>(action, null);

  if (state && "sent" in state && successMessage) {
    return <Alert tone="info">{successMessage}</Alert>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {children}
      {state && "error" in state ? <Alert>{state.error}</Alert> : null}
      <SubmitButton label={submitLabel} />
    </form>
  );
}
