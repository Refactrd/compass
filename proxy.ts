import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/types/database";

const PUBLIC_ROUTES = [
  "/login",
  "/reset-password",
  "/set-password",
  "/access-revoked",
  "/auth/callback",
  "/auth/confirm",
];

/**
 * Refreshes the Supabase session cookie on every request and keeps
 * unauthenticated traffic out of the app.
 *
 * Role gating (consultant vs admin) is deliberately *not* here — it needs a
 * database read, and doing it in the route group layouts keeps the check next
 * to the pages it protects. The proxy only answers "is there a session".
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database, "compass">(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      db: { schema: "compass" },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser, not getSession: this revalidates the token against Supabase Auth,
  // so a session revoked by an admin mid-session stops working here rather
  // than surviving until the JWT expires.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  // A redirect Location header means nothing to a fetch() caller unless it
  // explicitly asks for redirect: "manual" — the default is to follow it, so
  // an API route hitting either branch below would silently receive the
  // *target page's* 200 HTML back as if it were its own response, with no
  // signal to act on. /api/messages already replicates both checks itself and
  // returns proper JSON with a status code and a flag the client reads
  // (accessRevoked, or a plain 401), so page-navigation UX belongs here and
  // API auth belongs to the routes; this is what keeps that boundary real
  // rather than the proxy quietly overriding it first.
  const isApiRoute = pathname.startsWith("/api/");

  // Disabling an account bans it in Supabase Auth, which makes getUser fail
  // outright rather than return a user we could inspect. Without this branch
  // that is indistinguishable from being signed out, and the person gets a
  // login form they will try, fail, and be confused by. Supabase names this
  // case precisely, so route it to the screen that explains what happened.
  const banned = error?.code === "user_banned" || error?.status === 403;
  if (banned && !isPublicRoute && !isApiRoute) {
    const revokedUrl = request.nextUrl.clone();
    revokedUrl.pathname = "/access-revoked";
    revokedUrl.search = "?reason=disabled";
    return NextResponse.redirect(revokedUrl);
  }

  if (!user && !isPublicRoute && !isApiRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets. Auth routes are
    // included on purpose so the session cookie is refreshed there too.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
