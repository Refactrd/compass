"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { restoreEngagement, type ArchiveActionState } from "@/app/(admin)/admin/engagements/actions";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/ui/toast";

function RestoreSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" loading={pending}>
      {pending ? "Restoring" : "Restore"}
    </Button>
  );
}

/** Restoring is not destructive, unlike archiving, so it goes straight
 * through without a confirmation dialog. */
export function RestoreEngagementButton({ engagementId }: { engagementId: string }) {
  const [state, action] = useActionState<ArchiveActionState, FormData>(
    restoreEngagement,
    null,
  );
  useActionToast(state);

  return (
    <form action={action}>
      <input type="hidden" name="engagementId" value={engagementId} />
      <RestoreSubmit />
    </form>
  );
}
