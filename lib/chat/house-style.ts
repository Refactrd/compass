/**
 * House style enforcement for model output.
 *
 * No em dashes, no en dashes. The system prompt asks for this, which handles
 * almost everything and produces better prose than a find-and-replace would,
 * because the model rewrites the sentence rather than patching it. This is the
 * backstop for the cases where it slips, so the rule is a guarantee rather than
 * a strong preference.
 *
 * Ordinary hyphens are untouched: "last-mile" and "co-ordination" are correct.
 */

export function applyHouseStyle(text: string): string {
  return (
    text
      // A numeric range is the one case that genuinely wants a hyphen:
      // "2020–2021", "10–15 days".
      .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2")
      // An unspaced en dash between words is a compound relationship:
      // "cost–benefit", "client–consultant".
      .replace(/([a-zA-Z])–([a-zA-Z])/g, "$1-$2")
      // Everything else is a dash doing a comma's job, whether it is spaced or
      // set tight against the words. An unspaced em dash is usually
      // parenthetical, and hyphenating it produces "people-especially-this",
      // which reads worse than the comma it replaces.
      .replace(/\s*[—–]\s*/g, ", ")
      // Tidy the seams the replacement can leave behind.
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/,\s*,/g, ",")
      .replace(/,\s*([.;:!?])/g, "$1")
  );
}

/**
 * Streaming version.
 *
 * A spaced dash can straddle two deltas: one may end with "waiting " and the
 * next begin with "— the". Sanitising each delta alone would miss that, so a
 * trailing run of spaces and dashes is held back until the next delta completes
 * the pattern. The held text is at most a few characters, so nothing visible is
 * delayed.
 */
export class HouseStyleStream {
  private tail = "";

  push(delta: string): string {
    const buffer = this.tail + delta;
    const trailing = buffer.match(/[\s—–]+$/);
    const cut = trailing ? buffer.length - trailing[0].length : buffer.length;

    this.tail = buffer.slice(cut);
    return applyHouseStyle(buffer.slice(0, cut));
  }

  /** Whatever is still held back, once the stream has ended. */
  flush(): string {
    const remainder = applyHouseStyle(this.tail);
    this.tail = "";
    return remainder;
  }
}
