"use client";

import { Check, Copy, Link2, Trash2, UserCheck, UserX } from "lucide-react";
import { useActionState, useState } from "react";

import {
  createInviteLink,
  deleteUser,
  setUserStatus,
} from "@/app/(admin)/admin/users/actions";
import type { UserActionState } from "@/app/(admin)/admin/users/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useActionToast } from "@/components/ui/toast";

type Props = {
  userId: string;
  email: string;
  status: "invited" | "active" | "disabled";
  isSelf: boolean;
};

/**
 * Per row controls: disable or re-enable, copy a one time sign in link, and
 * delete behind a typed confirmation.
 *
 * Actions on your own row are hidden rather than disabled. The server refuses
 * them regardless, but offering a button that always fails is worse than not
 * offering it.
 */
export function UserRowActions({ userId, email, status, isSelf }: Props) {
  const [statusState, statusAction] = useActionState<UserActionState, FormData>(
    setUserStatus,
    null,
  );
  const [linkState, linkAction] = useActionState<UserActionState, FormData>(
    createInviteLink,
    null,
  );
  const [deleteState, deleteAction] = useActionState<UserActionState, FormData>(
    deleteUser,
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  useActionToast(statusState);
  useActionToast(linkState);
  useActionToast(deleteState, () => setConfirming(false));

  const link =
    linkState && "inviteLink" in linkState ? linkState.inviteLink : undefined;

  if (isSelf) {
    return <span className="text-xs text-slate-light">This is you</span>;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <form action={statusAction}>
          <input type="hidden" name="userId" value={userId} />
          <input
            type="hidden"
            name="intent"
            value={status === "disabled" ? "enable" : "disable"}
          />
          <Button type="submit" variant="secondary" className="px-2.5 py-1 text-xs">
            {status === "disabled" ? (
              <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <UserX className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {status === "disabled" ? "Re-enable" : "Disable"}
          </Button>
        </form>

        {status !== "active" ? (
          <form action={linkAction}>
            <input type="hidden" name="email" value={email} />
            <Button type="submit" variant="ghost" className="px-2.5 py-1 text-xs">
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              Copy link
            </Button>
          </form>
        ) : null}

        <Button
          variant="danger"
          className="px-2.5 py-1 text-xs"
          onClick={() => setConfirming((open) => !open)}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Delete
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        action={deleteAction}
        heading={`Delete ${email}?`}
        description="This removes the account and every conversation it owns. Client records are shared and survive. This cannot be undone."
        confirmValue={email}
        confirmLabel="Delete permanently"
      >
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="email" value={email} />
      </ConfirmDialog>

      {link ? (
        <div className="w-full max-w-sm rounded-lg border border-border bg-surface-sunken p-2.5 text-left">
          <p className="text-xs text-slate">One time link, expires soon:</p>
          <code className="mt-1 block truncate text-[0.6875rem] text-ink" title={link}>
            {link}
          </code>
          <Button
            type="button"
            variant="ghost"
            className="mt-1 px-0 py-0 text-xs"
            onClick={() => {
              navigator.clipboard.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy to clipboard"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
