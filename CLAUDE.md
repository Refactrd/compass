# CLAUDE.md — Compass (Refactrd Consultant Intelligence Platform)

This file is the build guide for this repository. Read it before writing any code. It captures the decisions already made and why, so they don't get relitigated mid-build. The full design rationale lives in `docs/system-design.md` in this repo (copy the reference document alongside this file) — read this file for what to build and in what order, read that one if you need the "why" behind a decision in more depth.

## What this is

**Compass** — an internal tool for Refactrd consultants. Not a generic chatbot. It holds Refactrd's own consulting reasoning discipline — a fixed reasoning hierarchy and a maturity ladder for recommending interventions — and enforces it, rather than letting the model free-associate from a stated problem straight to a solution.

**Users:** Refactrd consultants, no fixed seat count. One admin managing accounts and the knowledge base.

**Timeline:** 2 weeks. Budget is tight. Every technology choice below was made against those two constraints specifically — don't substitute a "better" tool that adds setup time or cost without checking against this file first.

## Non-negotiable decisions

These were deliberated and finalized. Don't second-guess or redesign them mid-build:

- **No seat cap.** Admin invites consultants with no minimum or maximum. Nothing in the schema or logic should hardcode a user count.
- **Rate limit: 20 questions per consultant per day**, UTC reset, enforced server-side against a `UsageEvent` table, never trusted from the client.
- **Account creation is invite-only through the admin dashboard.** Admin enters an email, Supabase Auth sends an invite link, consultant sets their own password on first login. No manually-generated credentials.
- **Client records are shared, not access-controlled per consultant.** Any consultant can read or edit any Client. This is deliberate, not a gap.
- **Conversations and Messages are strictly per-user**, enforced with Postgres row-level security, not just hidden in the UI.
- **Client-context capture is conversational, not a form.** A consultant describes a situation in free text; the system extracts client facts (name, industry, size, notes) into a Client record automatically. A right-side context panel shows the extracted fields, editable inline — this is the correction surface, not the primary input method.
- **Client name matching:** on a new company name mentioned in conversation, fuzzy-match against existing Clients. If a plausible match is found, surface a one-click confirm-to-link prompt in the context panel. Never auto-merge silently.
- **One system prompt, not a multi-layer orchestration architecture.** Single Anthropic model call per turn — no tool-calling, no agent framework, no second orchestration layer. Revisit only if a real requirement for tools or multi-step agentic behavior shows up post-MVP.
- **pgvector inside the same Supabase Postgres instance for retrieval.** No separate/dedicated vector database.
- **No microservices split.** One Next.js app, frontend and API routes together.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend + backend | Next.js on Vercel |
| Database, vector store, auth, file storage | Supabase (Postgres + pgvector + Auth + Storage) |
| AI provider | Anthropic API |
| Email (invites, password reset) | Supabase's built-in email — do not add a dedicated email provider unless deliverability becomes an actual problem post-launch |
| Observability | Vercel + Supabase built-in logs only — no Sentry/Datadog at MVP |

**Model-calling isolation:** put all Anthropic API calls behind a single wrapper module (e.g. `lib/ai/client.ts`), not called directly from route handlers scattered across the app. This is the one piece of future-proofing worth doing now — it costs nothing and keeps a future provider swap contained to one file instead of a repo-wide search-and-replace.

## Data model

Tables: `User`, `Client`, `Conversation`, `Message`, `Document`, `DocumentChunk`, `UsageEvent`.

Full field list and relationships are in `docs/system-design.md`, Section 5. Two things worth restating because they were deliberately collapsed from a more elaborate original spec:
- No separate `Invitation` table — invite state lives on `User.status` (`invited`/`active`/`disabled`); Supabase Auth tracks the token itself.
- No separate `Source` table — which chunks an answer drew from is stored as `Message.source_chunk_ids`, an array field.

Row-level security policies should be written **at the same time as each table**, not added afterward. Specifically: `Conversation` and `Message` must only be readable/writable by their owning `user_id`. `Document`/`DocumentChunk` writes are admin-only. `UsageEvent` writes only happen server-side.

## System prompt structure

Four fixed sections, assembled in this order, plus two sections injected per-request:

1. Identity and scope — what this is, what it's not, redirect instruction for out-of-scope requests
2. Methodology — state the reasoning hierarchy (organization → function → workflow → bottleneck → evidence → impact → intervention → adoption → outcome) and the maturity ladder (clarify → improve → assist → integrate → operationalize → transform) as enforced rules, not suggestions. Don't recommend an intervention until the chain has enough support. Prefer the smallest sufficient maturity level.
3. Output rules — match requested format (table, email, decision memo) when asked, default to plain conversational prose otherwise. No emojis.
4. Grounding rules — never state something as fact without retrieval or conversation support. State plainly when there isn't enough information yet.
5. *(injected)* Retrieved knowledge — top pgvector matches, each tagged with its source Document title
6. *(injected)* Conversation context — current Client record fields + recent message history

Next-best-question behavior is not a separate system — it's the methodology section doing its job. Don't build a distinct "question generator."

## Design system

Concrete tokens, not just principles — use these directly rather than defaulting to generic choices:

**Typography:**
- Headings and wordmark: `Plus Jakarta Sans` (serif)
- Body and UI text: `IBM Plex Sans`
- Both loaded via `next/font/google`. Do not default to Inter or Space Grotesk.

**Color:**
- Primary text / ink: `#1C1C1E`
- Background: `#FAF9F6` (warm off-white, not stark white)
- Accent (interactive elements, highlights): `#B08D57` (warm brass)
- Secondary text / borders: a muted slate gray, mid-tone, low saturation

These are starting values — refine shades as needed for contrast/accessibility while building, but don't deviate from this palette family (ink/off-white/brass/slate) or introduce a different typeface pairing without a reason tied to an actual usability problem encountered while building.

## Design references

A `/design` folder in this repo contains screenshots pulled from several different Figma Community files. **These are style references, not screens to replicate.** None of them map to this product's actual screens (chat workspace, sidebar, context panel, admin dashboard) — they're a mood board, not a spec.

Use them to inform: layout rhythm and spacing, the overall sense of modernity, and how well a color/type choice reads in context. The specific palette and typography are already decided above — use the reference screenshots to inform spacing, density, and layout patterns, not to second-guess the color/type tokens already specified.

Concretely: build each screen from the functional requirements and project structure below first, then apply the design system above (spacing scale, the specified palette, the specified typefaces, corner radii, shadow depth) informed by the tone across the reference screenshots as a set, not any single one of them. If the references disagree with each other (one minimal, one denser), resolve toward whichever reads as more "serious professional tool" per the visual-design principle already stated (no glassmorphism, no chatbot/robot visual clichés) rather than splitting the difference.

## MVP scope — build this, and only this, in the 3 weeks

**Must have (full list — build all of it):**
- Admin: invite/disable/delete consultants, view today's question count per consultant
- Admin: document upload with automatic chunk+embed, view/deactivate ingested documents
- Admin: usage view (questions per consultant, current week/month)
- Consultant: login/logout/password reset
- Consultant: start a conversation in free text, no form-first flow
- Diagnostic follow-up questions when information is insufficient
- Retrieval with source Document titles shown alongside responses, expandable
- Streaming responses with three real activity states (retrieving, analyzing, preparing) tied to actual pipeline stages — not decorative
- One overall confidence indicator per response (plain sentence, not a score)
- Output format matching (table/email/memo/prose)
- Follow-up question chips, clickable
- Cold-start starting-point prompts on empty conversations
- Client-context auto-extraction + editable context panel + fuzzy-match link-confirmation
- Conversation list, search by title, delete own conversations
- Rate limit enforcement + visible counter + clear limit-reached messaging
- Four error states: AI provider down (message stays pending, retry available), empty retrieval (states it's unsourced), rate limit hit (states reset time), mid-session disable (redirect to access-revoked screen)
- Visual design: per the "Design system" and "Design references" sections above — the specified typography and color tokens, no glassmorphism, no chatbot/robot visual clichés

**Do not build these in the MVP** (they're real, planned, just not now — don't let scope creep pull them in):
Audit logging · dedicated observability platform · AI evaluation framework/test dataset · prompt injection defenses beyond baseline input validation · abuse detection beyond the daily counter · conversation summarization · per-claim confidence labeling · 90–180 day roadmap generation · document versioning · formal RLS review at scale · guided cold-start tutorial · multi-format export · dedicated email service · penetration testing · dedicated vector database · staging environment

If a must-have and a not-now item seem to be in tension while building (e.g. wanting better abuse protection while building rate limiting), default to the MVP list. Flag it in a comment or a PR note instead of expanding scope unilaterally.

## Build sequence

Account creation and the admin shell gate everything else — build them first, even though the chat is the actual product.

**Week 1:** Project scaffold + schema + RLS (days 1–2) → Admin Users section, invite flow, session revocation on disable (days 3–4) → Admin Documents section, upload/chunk/embed pipeline tested end to end (day 5).

**Week 2:** Chat shell, streaming, persistence, sidebar (days 1–2) → retrieval pipeline wired to UI (day 3) → system prompt + client-context extraction + context panel (day 4) → fuzzy Client matching, follow-up chips, cold-start prompts, real activity states (day 5).

**Week 3:** Rate-limit enforcement + UI counter (day 1) → Admin Usage section (day 2) → error-state pass, all four states deliberately triggered and confirmed (day 3) → security pass — RLS tested with two real accounts, not just reviewed as code; keys confirmed server-side only; storage bucket confirmed private (day 4) → deploy + real walkthrough with 2–3 consultants (day 5).

## Testing approach

No separate unit-test-suite phase — test inline with each day's build given the timeline. The one place that needs deliberate, structured testing rather than eyeballing: **row-level security**, tested with two real accounts attempting to cross-read each other's conversations, not just a code review. The week 3 day 5 walkthrough with real consultants is the end-to-end test and the cold-start validation combined. No load testing — not warranted at this usage volume.

## Production-readiness checklist (gate before rollout)

- [ ] RLS policies tested with two real accounts
- [ ] API keys confirmed absent from any client-side bundle
- [ ] Session revocation on disable confirmed working
- [ ] All four error states triggered and confirmed
- [ ] Rate limit confirmed enforced server-side (attempt a client-side bypass)
- [ ] Storage bucket confirmed private
- [ ] At least one real document ingested and successfully retrieved live
- [ ] 2–3 consultants have used it end to end, no blocking issue

## Suggested project structure

```
/app
  /(consultant)          # chat workspace routes, gated to role=consultant or admin
  /(admin)                # admin dashboard routes, gated to role=admin
  /api
    /conversations
    /messages
    /documents
    /admin
/lib
  /ai
    client.ts             # single Anthropic wrapper — see "model-calling isolation" above
    system-prompt.ts
    retrieval.ts
    extraction.ts          # client-context extraction pass
/components
  /chat
  /admin
/supabase
  /migrations              # schema + RLS policies, versioned
/design
  *.png / *.jpg              # Figma Community reference screenshots — style reference only, see "Design references"
docs/
  system-design.md          # full reference doc
CLAUDE.md                   # this file
```

When creating new components, note the folder/file path they belong in per the structure above rather than defaulting to wherever's convenient.

## What's still an open decision

None — every open question from the design phase was resolved before this file was written. If something comes up during the build that isn't covered here (an edge case, a library choice within a layer already decided), make the call that best fits the constraints above (3-week timeline, tight budget, MVP-scope discipline) and note it in a comment rather than pausing to ask, unless it touches one of the non-negotiable decisions at the top of this file.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
