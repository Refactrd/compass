"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { archiveEngagement } from "@/app/(admin)/admin/engagements/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

/**
 * Admin-only "Delete" for an immersion day. Never a hard delete: it archives
 * (migration 0010), same reasoning as conversation delete's ConfirmDialog use
 * (a real modal, not an inline expansion), but this one redirects afterward
 * since, unlike a conversation, the row it was on may no longer be the page
 * the admin is looking at (the engagement detail page itself, not just a list
 * row).
 */
export function ArchiveEngagementButton({
  engagementId,
  clientName,
  redirectTo,
}: {
  engagementId: string;
  clientName: string;
  redirectTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete immersion day for ${clientName}`}
        title="Delete immersion day"
        className="rounded-md p-1.5 text-slate-light transition-colors hover:bg-danger-tint hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        action={(formData) => {
          setOpen(false);
          startTransition(async () => {
            const result = await archiveEngagement(null, formData);
            if (result && "error" in result) {
              toast("error", result.error);
              return;
            }
            toast("success", "Immersion day archived.");
            if (redirectTo) router.push(redirectTo);
            else router.refresh();
          });
        }}
        heading={`Delete the immersion day for ${clientName}?`}
        description="This moves it to the archive rather than deleting it outright. An admin can restore it from Admin -> Archived immersion days."
        confirmValue="delete"
        confirmLabel="Delete immersion day"
      >
        <input type="hidden" name="engagementId" value={engagementId} />
      </ConfirmDialog>
    </>
  );
}
