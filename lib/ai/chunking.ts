/**
 * Splits a document into chunks for embedding.
 *
 * Paragraph aware rather than a fixed character window. Refactrd methodology
 * material is prose with headings, and cutting mid-sentence produces chunks
 * that retrieve badly and read worse when shown as a source.
 *
 * Overlap carries the tail of one chunk into the next so a point that straddles
 * a boundary is still findable from either side.
 */

const TARGET_CHARS = 1400;
const OVERLAP_CHARS = 200;
const MIN_CHUNK_CHARS = 80;

/** Collapses the whitespace noise that PDF extraction leaves behind. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkText(raw: string): string[] {
  const text = normalizeText(raw);
  if (!text) return [];

  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed.length >= MIN_CHUNK_CHARS) {
      chunks.push(trimmed);
    } else if (trimmed && chunks.length > 0) {
      // A stray fragment on its own retrieves as noise. Attach it to the
      // previous chunk instead of storing it alone.
      chunks[chunks.length - 1] += `\n\n${trimmed}`;
    } else if (trimmed) {
      chunks.push(trimmed);
    }
    current = "";
  };

  for (const paragraph of paragraphs) {
    // A single paragraph longer than the target gets split on sentence
    // boundaries rather than mid-word.
    if (paragraph.length > TARGET_CHARS) {
      flush();
      for (const piece of splitLongParagraph(paragraph)) {
        chunks.push(piece);
      }
      continue;
    }

    if (current.length + paragraph.length + 2 > TARGET_CHARS) {
      flush();
      const previous = chunks[chunks.length - 1];
      if (previous) current = tail(previous, OVERLAP_CHARS);
    }

    current += (current ? "\n\n" : "") + paragraph;
  }

  flush();
  return chunks;
}

function splitLongParagraph(paragraph: string): string[] {
  const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [
    paragraph,
  ];

  const pieces: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > TARGET_CHARS && current) {
      pieces.push(current.trim());
      current = tail(current, OVERLAP_CHARS);
    }
    current += sentence;
  }
  if (current.trim()) pieces.push(current.trim());

  return pieces;
}

/** Last N characters, snapped forward to a word boundary. */
function tail(text: string, chars: number): string {
  if (text.length <= chars) return `${text} `;
  const slice = text.slice(-chars);
  const boundary = slice.indexOf(" ");
  return `${boundary === -1 ? slice : slice.slice(boundary + 1)} `;
}
