"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { THEME_COOKIE, isTheme, type Theme } from "@/lib/theme";

/**
 * Stores the appearance preference.
 *
 * A cookie rather than localStorage so the server can render the right theme
 * immediately. It carries no personal data, is not read by any API route, and
 * is scoped lax, so it is not a tracking concern.
 */
export async function setTheme(theme: Theme) {
  if (!isTheme(theme)) return;

  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });

  revalidatePath("/", "layout");
}
