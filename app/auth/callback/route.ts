import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * PKCE callback: exchanges a `code` query parameter for a session.
 *
 * Used when the project's email templates link to `{{ .ConfirmationURL }}`
 * with the code flow. The `token_hash` format is handled by ../confirm.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  const rawNext = searchParams.get("next") ?? "/set-password";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//")
    ? rawNext
    : "/set-password";

  if (!code) {
    return NextResponse.redirect(new URL("/set-password", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/set-password", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
