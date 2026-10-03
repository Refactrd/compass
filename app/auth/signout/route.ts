import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

/**
 * POST only. A GET sign-out can be triggered by any page that embeds an image
 * or link pointing at it, which makes logging people out a drive-by action.
 *
 * Accepts an optional ?next=, carried through to /login so it reaches
 * signIn() on the other side (components/ui/session-expiry-banner.tsx's
 * proactive "sign in again now" needs to sign out first, since an already
 * authenticated visit to /login just bounces straight back per proxy.ts).
 * Ordinary sign-out (the sidebar's own form) passes none and keeps landing on
 * a bare /login, same as before.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const next = safeNext(request.nextUrl.searchParams.get("next"), "");
  const loginUrl = new URL("/login", request.nextUrl.origin);
  if (next) loginUrl.searchParams.set("next", next);

  return NextResponse.redirect(loginUrl, { status: 303 });
}
