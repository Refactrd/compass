"use client";

import { Upload } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { ingestDocument } from "@/app/(admin)/admin/documents/actions";
import type { DocumentActionState } from "@/app/(admin)/admin/documents/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useActionToast } from "@/components/ui/toast";
import { ACCEPT_ATTRIBUTE } from "@/lib/ai/document-formats";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Reading, chunking, embedding…" : "Upload and ingest"}
    </Button>
  );
}

/**
 * Upload panel.
 *
 * Ingestion runs in the request, so the pending label names all three stages
 * rather than a generic spinner. A large PDF genuinely takes a while and a
 * silent wait reads as a hang.
 */
export function DocumentUpload() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<DocumentActionState, FormData>(
    ingestDocument,
    null,
  );

  // Success closes the panel, so the next upload starts from a clean form
  // rather than under a stale message.
  useActionToast(state, () => setOpen(false));

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" aria-hidden="true" />
        Upload a document
      </Button>
    );
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-surface p-4 text-left">
      <form action={formAction} className="flex flex-col gap-3">
        <Field
          label="File"
          htmlFor="document-file"
          hint="PDF, Word, plain text or Markdown, up to 20MB. Scanned PDFs need OCR first."
        >
          <Input
            id="document-file"
            name="file"
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            required
            className="file:mr-3 file:rounded file:border-0 file:bg-surface-sunken file:px-2 file:py-1 file:text-xs file:text-ink"
          />
        </Field>

        <Field
          label="Title"
          htmlFor="document-title"
          hint="Shown to consultants as the source of an answer. Defaults to the filename."
        >
          <Input
            id="document-title"
            name="title"
            placeholder="Refactrd engagement methodology"
          />
        </Field>

        <div className="flex items-center gap-2">
          <Submit />
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </form>
    </div>
  );
}
