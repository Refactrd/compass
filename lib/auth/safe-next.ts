/**
 * Validates a `next` redirect target.
 *
 * Local paths only. An absolute URL here would make either caller (the
 * emailed-link route, and sign-in's post-login redirect) an open redirect.
 * Shared so the same rule governs both instead of drifting.
 */
export function safeNext(raw: string | null, fallback = "/"): string {
  if (!raw) return fallback;
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}
