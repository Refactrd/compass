# Compass

Internal consultant intelligence platform for Refactrd. Read `CLAUDE.md` before
writing code — it holds the decisions and the build order. `docs/system-design.md`
has the rationale behind them.

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · Supabase
(Postgres + pgvector + Auth + Storage) · Anthropic API. Package manager: **npm**.

## Setup

```bash
npm install
npm run dev          # http://localhost:3000
npm run build
npm run lint
```

### Environment

Create `.env.local` (gitignored) from the template below. A tooling hook in this
workspace blocks writing `.env*` files, so copy this by hand.

```bash
# --- Supabase -------------------------------------------------------------
# URL and anon key are public by design — safe in the browser bundle because
# every table is protected by row-level security.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Service role key. Bypasses RLS. Server-side only — never prefix with
# NEXT_PUBLIC_ and never import lib/supabase/admin.ts from a client component.
SUPABASE_SERVICE_ROLE_KEY=

# --- Anthropic ------------------------------------------------------------
# Server-side only. All calls route through lib/ai/client.ts (week 2).
ANTHROPIC_API_KEY=

# --- Embeddings -----------------------------------------------------------
# Anthropic has no embeddings endpoint, so retrieval uses a separate provider.
# document_chunks.embedding is vector(1024) — whatever is configured here must
# emit 1024 dimensions. Wired up week 1 day 5.
EMBEDDING_API_KEY=

# --- App ------------------------------------------------------------------
# Origin used to build invite and password-reset redirect links.
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# --- Email (Resend) ---------------------------------------------------------
# Supabase's built-in email is development grade and rate limited, so account
# emails go through Resend instead via a Send Email Hook. See "Email" below.
RESEND_API_KEY=
RESEND_FROM_EMAIL=info@refactrd.com
SEND_EMAIL_HOOK_SECRET=
```

### Database

Apply everything in `supabase/migrations/` in order, either by pasting into the
SQL editor or with `supabase db push`. They need owner privileges: they enable
the `vector` extension, add a trigger on `auth.users`, and create policies on
`storage.objects`.

**Compass lives in its own `compass` schema, not `public`.** This Supabase
project is shared with another Refactrd product that owns `public.documents`,
a `documents` storage bucket, and several other tables. Migration 0001 created
Compass in `public` and collided with it; 0002 moves everything into `compass`
and hands `public` back untouched. Compass uses the `compass-documents` bucket.

After applying 0002, **add `compass` to Exposed Schemas** in
Supabase → Settings → API, or PostgREST will not serve these tables.

0001 refuses to run once the `compass` schema exists. Re-running it would find
nothing in `public` and build a second, empty set of tables shadowing the real
ones.

The migration is written so each table is immediately followed by its RLS
policies, per `CLAUDE.md`, and is safe to re-run — every object is guarded with
`if not exists`, `create or replace`, or a preceding `drop ... if exists`.

One deliberate exception to the table-then-policies order: `public.users` is
created above the auth helper functions, because those are `LANGUAGE SQL` and
Postgres resolves their bodies against the catalog at `CREATE FUNCTION` time.
Its policies stay in the users section further down.

### Verifying a live project

Paste `supabase/tests/verify.sql` into the Supabase SQL editor. It is read-only
— it creates and changes nothing — and returns 23 structural checks with
failures sorted to the top: tables, RLS enablement, every expected policy and
its command, the security-critical negatives (no write policy on `users` or
`usage_events`, no update policy on `messages`), helper functions being
`security definer` with a pinned `search_path`, the vector column and HNSW
index, and the storage bucket being private.

Two of those checks exist because policies created outside these migrations —
from the dashboard policy editor, say — are OR'd together with ours and can
silently defeat them. Check 6 flags any policy on our tables that the
migrations did not create; check 23 flags any policy granted to `public` or
`anon` rather than `authenticated`. A permissive `using (true)` policy granted
to `public` makes a table world-writable through the anon key, no matter how
correct the surrounding policies are.

Run it after applying any migration to a real project.

### Testing RLS

```bash
./supabase/tests/run.sh      # requires Docker; exits non-zero on any failure
```

Spins up a throwaway Postgres, applies every migration twice (so a migration
that isn't re-runnable fails the build), then asserts the policies behave using
three real accounts — two consultants and an admin. This is the
"tested with two real accounts, not just reviewed as code" checklist item.
Run it after any migration change.

The harness installs pgvector into `public` rather than `extensions` on purpose.
That is how it sits on older Supabase projects, and it is the layout that broke
the first real run of `0001`; keeping it that way means the migration stays
proven against the awkward case, not just the convenient one.

## Email

Invites and password resets are sent by Resend, not Supabase's built-in
email (development grade, rate limited to a couple of messages an hour,
which is why `app/(admin)/admin/users/actions.ts` originally had a
"copy link instead" fallback). The swap is a Supabase Auth **Send Email
Hook**: Supabase stops sending mail itself and instead calls
`app/api/auth/send-email/route.tsx` for every invite, password reset,
magic link, or email change, passing the recipient and a one-time token.
That route renders a branded React Email template
(`components/email/*`, light and dark mode both handled by the
`prefers-color-scheme` block and the `[data-ogsc]` Outlook.com override in
`components/email/brand.tsx`) and sends it through `lib/email/resend.ts`.

Two things only exist in Supabase's dashboard, not in this repo, the same
way "Exposed Schemas" and the storage bucket's public flag do:

1. **Resend**: add and verify the sending domain (Resend → Domains), which
   means adding the SPF/DKIM records it gives you to that domain's DNS.
   Nothing sends until the domain shows verified. `RESEND_FROM_EMAIL` must
   be an address at that domain.
2. **Supabase**: Authentication → Hooks → Send Email → HTTPS, pointing at
   `${NEXT_PUBLIC_SITE_URL}/api/auth/send-email` (the production URL once
   deployed). Enabling it hands Supabase a signing secret, formatted
   `v1,whsec_...`; put that whole string in `SEND_EMAIL_HOOK_SECRET`. The
   route verifies every request against it (`standardwebhooks`), so a
   request that isn't actually from Supabase gets a 401, not a sent email.

A failure inside the hook (bad signature, Resend rejects the send, the
domain isn't verified) fails the underlying invite or reset itself, not
just the email; Supabase treats the hook's response as authoritative. That
is deliberate: an invite that reports success but never arrives is worse
than one that visibly fails.

To preview a template without sending anything, render it to a file and
open it, or reuse the pattern in `lib/email/resend.ts` (`render()` from
`@react-email/render` needs no network access).

## Deploying

Vercel, per the tech stack in `CLAUDE.md`. No `vercel.json` is needed, a
plain Next.js app builds and deploys with Vercel's defaults.

1. **Connect the repo** in the Vercel dashboard (New Project, import this
   GitHub repo). Framework preset autodetects as Next.js.
2. **Set every env var from the template above** in Vercel's Project
   Settings -> Environment Variables, for Production (and Preview, if
   preview deploys should also work end to end). `NEXT_PUBLIC_SITE_URL`
   must be the real production URL, not `localhost`, since it is what
   invite and reset links are built from.
3. **Supabase -> Authentication -> URL Configuration**: add the production
   URL to Site URL and to Redirect URLs (`https://<domain>/auth/confirm`
   at minimum). A login or invite link built against a URL Supabase does
   not recognize is rejected.
4. **Supabase -> Authentication -> Hooks -> Send Email**: point it at
   `https://<domain>/api/auth/send-email` (it can only target a live,
   reachable URL, so this step comes after the first deploy, not before).
   Re-verify the hook secret in Vercel's env vars matches what Supabase
   shows after that update, it is reissued if the hook is re-saved.
5. **Resend**: confirm the sending domain still shows verified. Do this
   again here, not just once locally, DNS and domain verification are
   account level and do not depend on where the app is hosted, but it is
   the last thing that silently breaks invites if skipped.
6. Run through the production readiness checklist in `CLAUDE.md` once
   against the deployed URL, the local/dev-environment version of that
   pass (Week 3, Day 4 here) does not substitute for checking it against
   what people will actually use.

## Appearance

Light and dark, chosen per viewer and stored in a `compass-theme` cookie
(`light` / `dark` / `system`, defaulting to `system`). The control lives in the
footer of the auth screens and in the header of both dashboards.

The cookie is read on the server in `app/layout.tsx`, so the correct theme is on
`<html>` in the first byte of HTML. That is what avoids a flash of the wrong
theme without a blocking inline script. `system` deliberately sets no attribute,
leaving the `prefers-color-scheme` rules in `app/globals.css` to decide.

Dark is not an inversion of light. It keeps the same warm, papery character by
using a warm near black rather than a blue black, and lifts brass to
`#C9A46A` / `#DCBB84` so it still carries text. Both palettes are defined as
`--c-*` variables that `@theme inline` maps onto Tailwind utilities, so
`bg-canvas` follows the active theme at runtime.

Anything that depends on the viewer's clock or timezone (the greeting, the date
and time) resolves after hydration via `lib/hooks/use-now.ts`, which wraps
`useSyncExternalStore`. Rendering a real time during SSR would guarantee a
hydration mismatch and briefly show the wrong time.

Greetings and showcase quotes live in `lib/copy/greetings.ts`. House style for
that file: no em dashes, no en dashes.

## Layout

```
app/            routes; (consultant) and (admin) route groups land here
lib/
  supabase/     client.ts (browser) · server.ts (RLS-scoped) · admin.ts (service role)
  types/        hand-maintained Database types mirroring the migrations
  ai/           Anthropic wrapper, system prompt, retrieval, extraction (week 2)
components/     chat/ and admin/ (weeks 1-2)
supabase/
  migrations/   schema + RLS, versioned
docs/           system-design.md
design/         Figma Community screenshots — style reference only
proxy.ts        session refresh + unauthenticated redirect
```

## Security notes

- Three Supabase clients, used deliberately. `lib/supabase/server.ts` is the
  default for server-side reads and writes and stays subject to RLS.
  `lib/supabase/admin.ts` bypasses RLS and carries a `server-only` import, so
  reaching for it from a client component is a build error.
- Role is read from `public.users` on every request, never from a JWT claim, so
  a disabled or demoted account loses access on its next request rather than at
  token expiry.
- Conversations and messages are strictly per-user at the database layer,
  admins included — there is no admin read-through.
- `usage_events` has no insert or update policy. The daily cap is only writable
  by the service role, which is what makes it unbypassable from the browser.
