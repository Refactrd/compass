/**
 * Upload constraints, shared by the client form and the server extractor.
 *
 * Separate from extract-text.ts because that module is `server-only` (it pulls
 * in the PDF and Word parsers). The file input needs the accept list too, so
 * the constants live here where both sides can reach them and the parsers stay
 * out of the browser bundle.
 */

export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"] as const;
export const ACCEPT_ATTRIBUTE = ".pdf,.docx,.txt,.md";
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
