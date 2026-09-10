"use server";

import { revalidatePath } from "next/cache";

import { requireActiveAdmin } from "@/lib/auth/guards";
import { chunkText } from "@/lib/ai/chunking";
import { embed, embeddingModel, estimateRequestCount } from "@/lib/ai/embeddings";
import {
  ACCEPTED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
} from "@/lib/ai/document-formats";
import { extractText } from "@/lib/ai/extract-text";
import { createAdminClient } from "@/lib/supabase/admin";

export type DocumentActionState =
  | { error: string }
  | { ok: string }
  | null;

/** Compass-owned bucket. The plain `documents` bucket belongs to another
 *  product on this Supabase project (see migration 0002). */
const DOCUMENTS_BUCKET = "compass-documents";


/**
 * Builds a Supabase Storage object key from a filename.
 *
 * Storage keys are restricted to an ASCII-safe set. Real document names are
 * not: "Refactrd Core Knowledge Base — 01.pdf" contains an em dash, which the
 * API rejects with a bare "Invalid key" that says nothing about why.
 *
 * The sanitised name is only ever the storage key. The document's `title`
 * keeps the original text, punctuation and all, because that is what
 * consultants see cited as a source.
 */
function toStorageKey(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  const stem = lastDot > 0 ? filename.slice(0, lastDot) : filename;
  const extension = lastDot > 0 ? filename.slice(lastDot + 1) : "";

  const clean = (value: string) =>
    value
      // Splits accented characters into letter plus combining mark, so the
      // mark can be dropped and the letter kept: "café" becomes "cafe".
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^[-._]+|[-._]+$/g, "");

  // Long enough to stay recognisable, short enough to leave room for the
  // uniqueness prefix within the key length limit.
  const safeStem = clean(stem).slice(0, 96) || "document";
  const safeExtension = clean(extension).toLowerCase();

  return safeExtension ? `${safeStem}.${safeExtension}` : safeStem;
}

/**
 * Upload, extract, chunk, embed and store, in one pass.
 *
 * Deliberately synchronous rather than a background job. At this document
 * volume a queue would be infrastructure with nothing to do, and the admin
 * finding out immediately that a scanned PDF has no text layer is worth more
 * than a fast redirect (CLAUDE.md, MVP scope discipline).
 */
export async function ingestDocument(
  _prev: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const admin = await requireActiveAdmin();

  const file = formData.get("file");
  const titleInput = String(formData.get("title") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`,
    };
  }
  if (!ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
    return {
      error: `Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}.`,
    };
  }

  const title = titleInput || file.name.replace(/\.[^.]+$/, "");

  let text: string;
  try {
    text = await extractText(file);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not read that file." };
  }

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return { error: "That document produced no usable text." };
  }

  let vectors: number[][];
  try {
    vectors = await embed(chunks, "document");
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Embedding failed.",
    };
  }

  const supabase = createAdminClient();

  // Private, admin-only bucket. The path is namespaced by upload time
  // so re-uploading the same filename does not overwrite the earlier copy.
  const storagePath = `${Date.now()}-${crypto.randomUUID()}/${toStorageKey(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return {
      error: `Could not store the file: ${uploadError.message}`,
    };
  }

  const { data: document, error: insertError } = await supabase
    .from("documents")
    .insert({
      title,
      storage_path: storagePath,
      uploaded_by: admin.id,
      status: "active",
    })
    .select("id")
    .single();

  if (insertError || !document) {
    // Do not leave an orphaned file behind if the row could not be written.
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
    return { error: `Could not save the document: ${insertError?.message}` };
  }

  const { error: chunkError } = await supabase.from("document_chunks").insert(
    chunks.map((content, index) => ({
      document_id: document.id,
      content,
      chunk_index: index,
      // pgvector accepts the bracketed string form over PostgREST.
      embedding: `[${vectors[index].join(",")}]`,
    })),
  );

  if (chunkError) {
    // A document row with no chunks is invisible to retrieval but visible in
    // the list, which reads as "ingested" when it is not. Roll the whole thing
    // back instead.
    await supabase.from("documents").delete().eq("id", document.id);
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
    return { error: `Could not store chunks: ${chunkError.message}` };
  }

  revalidatePath("/admin/documents");
  const requests = estimateRequestCount(chunks);
  return {
    ok: `Ingested "${title}" as ${chunks.length} chunk${chunks.length === 1 ? "" : "s"} using ${embeddingModel()}, in ${requests} embedding request${requests === 1 ? "" : "s"}.`,
  };
}

export async function setDocumentStatus(
  _prev: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  await requireActiveAdmin();

  const documentId = String(formData.get("documentId") ?? "");
  const deactivate = formData.get("intent") === "deactivate";

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("documents")
    .update({ status: deactivate ? "deactivated" : "active" })
    .eq("id", documentId);

  if (error) return { error: error.message };

  revalidatePath("/admin/documents");
  return {
    ok: deactivate
      ? "Deactivated. Retrieval will stop drawing on it, and its chunks are kept."
      : "Reactivated and available to retrieval again.",
  };
}

export async function deleteDocument(
  _prev: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  await requireActiveAdmin();

  const documentId = String(formData.get("documentId") ?? "");
  const title = String(formData.get("title") ?? "");
  const confirmation = String(formData.get("confirm") ?? "").trim();

  if (confirmation !== title) {
    return { error: "Type the document title exactly to confirm deletion." };
  }

  const supabase = createAdminClient();

  const { data: document } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .single();

  // Chunks cascade from the document row. The stored file does not, so it is
  // removed explicitly or the private bucket accumulates orphans.
  const { error } = await supabase.from("documents").delete().eq("id", documentId);
  if (error) return { error: error.message };

  if (document?.storage_path) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([document.storage_path]);
  }

  revalidatePath("/admin/documents");
  return { ok: `Deleted "${title}" and its chunks.` };
}
