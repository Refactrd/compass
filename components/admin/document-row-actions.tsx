"use client";

import { Eye, EyeOff, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import {
  deleteDocument,
  setDocumentStatus,
} from "@/app/(admin)/admin/documents/actions";
import type { DocumentActionState } from "@/app/(admin)/admin/documents/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useActionToast } from "@/components/ui/toast";

export function DocumentRowActions({
  documentId,
  title,
  status,
}: {
  documentId: string;
  title: string;
  status: "active" | "deactivated";
}) {
  const [statusState, statusAction] = useActionState<
    DocumentActionState,
    FormData
  >(setDocumentStatus, null);
  const [deleteState, deleteAction] = useActionState<
    DocumentActionState,
    FormData
  >(deleteDocument, null);
  const [confirming, setConfirming] = useState(false);

  useActionToast(statusState);
  useActionToast(deleteState, () => setConfirming(false));

  return (
    <div className="flex items-center justify-end gap-1.5">
        <form action={statusAction}>
          <input type="hidden" name="documentId" value={documentId} />
          <input
            type="hidden"
            name="intent"
            value={status === "active" ? "deactivate" : "activate"}
          />
          <Button
            type="submit"
            variant="secondary"
            className="px-2 py-1.5"
            title={
              status === "active"
                ? "Deactivate, removing it from retrieval"
                : "Reactivate, returning it to retrieval"
            }
            aria-label={status === "active" ? "Deactivate" : "Reactivate"}
          >
            {status === "active" ? (
              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </Button>
        </form>

        <Button
          variant="danger"
          className="px-2 py-1.5"
          title="Delete permanently"
          aria-label="Delete"
          aria-expanded={confirming}
          onClick={() => setConfirming((open) => !open)}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        action={deleteAction}
        heading={`Delete "${title}"?`}
        description="This removes the file, its chunks and its embeddings. Answers that already cited it keep the reference, but it will no longer resolve. Deactivating is reversible; this is not."
        confirmValue={title}
        confirmLabel="Delete permanently"
      >
        <input type="hidden" name="documentId" value={documentId} />
        <input type="hidden" name="title" value={title} />
      </ConfirmDialog>
    </div>
  );
}
