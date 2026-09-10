import "server-only";

import { cookies } from "next/headers";

export const THEME_COOKIE = "compass-theme";
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * The viewer's stored appearance preference.
 *
 * Read on the server so the correct theme is on <html> in the first byte of
 * HTML. That is what avoids the flash of the wrong theme, without a blocking
 * inline script. "system" is deliberately left off the element so the
 * prefers-color-scheme rules in globals.css take over.
 */
export async function getTheme(): Promise<Theme> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : "system";
}
