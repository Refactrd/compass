import "server-only";

import { ACCEPTED_EXTENSIONS } from "@/lib/ai/document-formats";

/**
 * Pulls plain text out of an uploaded document.
 *
 * Formats chosen from what a consultancy's existing methodology material
 * actually is: PDF and Word, plus plain text and Markdown. Nothing here does
 * OCR, so a scanned PDF with no text layer produces nothing, and that is
 * reported rather than ingested as an empty document.
 */

export class ExtractionError extends Error {}

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf")) {
    // unpdf bundles a serverless build of pdf.js, so this works on Vercel
    // without a native binary.
    const { extractText: extractPdfText, getDocumentProxy } = await import(
      "unpdf"
    );
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    const merged = Array.isArray(text) ? text.join("\n\n") : text;

    if (!merged.trim()) {
      throw new ExtractionError(
        "No text found in that PDF. If it is a scan, it needs to be run through OCR before it can be ingested.",
      );
    }
    return merged;
  }

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer });
    if (!value.trim()) {
      throw new ExtractionError("That Word document appears to be empty.");
    }
    return value;
  }

  if (name.endsWith(".txt") || name.endsWith(".md")) {
    const text = buffer.toString("utf8");
    if (!text.trim()) throw new ExtractionError("That file is empty.");
    return text;
  }

  throw new ExtractionError(
    `Unsupported file type. Accepted formats: ${ACCEPTED_EXTENSIONS.join(", ")}.`,
  );
}
