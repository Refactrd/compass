"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { inviteConsultant } from "@/app/(admin)/admin/users/actions";
import type { UserActionState } from "@/app/(admin)/admin/users/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useActionToast } from "@/components/ui/toast";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send invitation"}
    </Button>
  );
}

/**
 * Invite panel, collapsed until needed so the roster stays the focus of the
 * page. There is no minimum or maximum seat count anywhere in this flow.
 */
export function InviteForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<UserActionState, FormData>(
    inviteConsultant,
    null,
  );

  useActionToast(state, () => setOpen(false));

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>Invite a consultant</Button>
    );
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-surface p-4 text-left">
      <form action={formAction} className="flex flex-col gap-3">
        <Field
          label="Email address"
          htmlFor="invite-email"
          hint="They set their own password from the emailed link. No credentials are created here."
        >
          <Input
            id="invite-email"
            name="email"
            type="email"
            placeholder="consultant@refactrd.com"
            required
          />
        </Field>

        <Field label="Role" htmlFor="invite-role">
          <select
            id="invite-role"
            name="role"
            defaultValue="consultant"
            className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:border-brass focus:outline-none"
          >
            <option value="consultant">Consultant</option>
            <option value="admin">Admin</option>
          </select>
        </Field>

        <div className="flex items-center gap-2">
          <Submit />
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
