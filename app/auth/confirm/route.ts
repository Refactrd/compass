import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for every emailed link: invitation, password recovery, magic
 * link, email change.
 *
 * Accepts both link formats, because which one arrives depends on how the
 * project's email templates are written and a half migrated set of templates
 * should degrade gracefully rather than dead end:
 *
 *   token_hash + type  ->  verifyOtp          (the {{ .TokenHash }} template)
 *   code               ->  exchangeCodeForSession  (PKCE {{ .ConfirmationURL }})
 *
 * Supabase also appends `error` and `error_description` when it rejects a link
 * before it ever reaches us. Those are translated into a specific reason rather
 * than swallowed, so an expired link says so instead of showing the generic
 * "no longer valid" message.
 */

/** Local paths only. An absolute URL here would make this an open redirect. */
function safeNext(raw: string | null): string {
  if (!raw) return "/set-password";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/set-password";
}

/**
 * Maps Supabase error codes onto our own copy.
 *
 * Deliberately does not pass `error_description` through to the page. It is
 * attacker controllable text in the query string, and reflecting it into the UI
 * to be read as a system message is a bad habit even where React escapes it.
 */
function reasonFor(code: string | null, description: string | null): string {
  const haystack = `${code ?? ""} ${description ?? ""}`.toLowerCase();
  if (haystack.includes("expired")) return "expired";
  if (haystack.includes("already") || haystack.includes("used")) return "used";
  return "invalid";
}

function backToSetPassword(origin: string, reason: string) {
  const url = new URL("/set-password", origin);
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));

  // Supabase rejected the link on its side, before redirecting here.
  const errorCode =
    searchParams.get("error_code") ?? searchParams.get("error");
  if (errorCode) {
    return backToSetPassword(
      origin,
      reasonFor(errorCode, searchParams.get("error_description")),
    );
  }

  const supabase = await createClient();

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error) {
      return backToSetPassword(origin, reasonFor(error.code ?? null, error.message));
    }
    return NextResponse.redirect(new URL(next, origin));
  }

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return backToSetPassword(origin, reasonFor(error.code ?? null, error.message));
    }
    return NextResponse.redirect(new URL(next, origin));
  }

  // Neither format present. Most often an implicit flow link, where the tokens
  // are in the URL fragment and never reach the server at all.
  return backToSetPassword(origin, "invalid");
}
