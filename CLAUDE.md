# CLAUDE.md — Compass (Refactrd Consultant Intelligence Platform)

This file is the build guide for this repository. Read it before writing any code. It captures the decisions already made and why, so they don't get relitigated mid-build. The full design rationale lives in `docs/system-design.md` in this repo (copy the reference document alongside this file) — read this file for what to build and in what order, read that one if you need the "why" behind a decision in more depth.

## What this is

**Compass** — an internal tool for Refactrd consultants. Not a generic chatbot. It holds Refactrd's own consulting reasoning discipline — a fixed reasoning hierarchy and a maturity ladder for recommending interventions — and enforces it, rather than letting the model free-associate from a stated problem straight to a solution.

**Users:** Refactrd consultants, no fixed seat count. One admin managing accounts and the knowledge base.

**Status: MVP is live.** 10 consultants onboarded and using it. Everything under "MVP scope" below has shipped — it's kept in this file as the historical record of what was decided and why, not as an open task list. The new work is under "Phase 2 — Immersion Day capability" further down.

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

See "Phase 2" below for the `Engagement`, `Department`, and `Document.category` additions layered on top of this model.

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

**This is Compass's own internal-tool design system — it is not Refactrd's company brand.** Do not use these tokens anywhere in the Phase 2 client-facing PDFs. See "Phase 2" below for the separate, real Refactrd brand assets.

## Design references

A `/design` folder in this repo contains screenshots pulled from several different Figma Community files. **These are style references, not screens to replicate.** None of them map to this product's actual screens (chat workspace, sidebar, context panel, admin dashboard) — they're a mood board, not a spec.

Use them to inform: layout rhythm and spacing, the overall sense of modernity, and how well a color/type choice reads in context. The specific palette and typography are already decided above — use the reference screenshots to inform spacing, density, and layout patterns, not to second-guess the color/type tokens already specified.

Concretely: build each screen from the functional requirements and project structure below first, then apply the design system above (spacing scale, the specified palette, the specified typefaces, corner radii, shadow depth) informed by the tone across the reference screenshots as a set, not any single one of them. If the references disagree with each other (one minimal, one denser), resolve toward whichever reads as more "serious professional tool" per the visual-design principle already stated (no glassmorphism, no chatbot/robot visual clichés) rather than splitting the difference.

## MVP scope — shipped

**Must have (full list — all shipped):**
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

**Deferred at MVP, revisit as they come up:**
Audit logging · dedicated observability platform · AI evaluation framework/test dataset · prompt injection defenses beyond baseline input validation · abuse detection beyond the daily counter · conversation summarization · per-claim confidence labeling · document versioning · formal RLS review at scale · guided cold-start tutorial · multi-format export · dedicated email service · penetration testing · dedicated vector database · staging environment

(90–180 day roadmap generation was also on this list. It's back, scoped for real, as part of Phase 2 below — the deferral was "not yet designed properly," not "not needed.")

## Build sequence — MVP (shipped)

Account creation and the admin shell gate everything else — build them first, even though the chat is the actual product.

**Week 1:** Project scaffold + schema + RLS (days 1–2) → Admin Users section, invite flow, session revocation on disable (days 3–4) → Admin Documents section, upload/chunk/embed pipeline tested end to end (day 5).

**Week 2:** Chat shell, streaming, persistence, sidebar (days 1–2) → retrieval pipeline wired to UI (day 3) → system prompt + client-context extraction + context panel (day 4) → fuzzy Client matching, follow-up chips, cold-start prompts, real activity states (day 5).

**Week 3:** Rate-limit enforcement + UI counter (day 1) → Admin Usage section (day 2) → error-state pass, all four states deliberately triggered and confirmed (day 3) → security pass — RLS tested with two real accounts, not just reviewed as code; keys confirmed server-side only; storage bucket confirmed private (day 4) → deploy + real walkthrough with 2–3 consultants (day 5).

## Testing approach — MVP (shipped)

No separate unit-test-suite phase — test inline with each day's build given the timeline. The one place that needs deliberate, structured testing rather than eyeballing: **row-level security**, tested with two real accounts attempting to cross-read each other's conversations, not just a code review. The week 3 day 5 walkthrough with real consultants is the end-to-end test and the cold-start validation combined. No load testing — not warranted at this usage volume.

## Production-readiness checklist — MVP (shipped)

- [x] RLS policies tested with two real accounts
- [x] API keys confirmed absent from any client-side bundle
- [x] Session revocation on disable confirmed working
- [x] All four error states triggered and confirmed
- [x] Rate limit confirmed enforced server-side (attempt a client-side bypass)
- [x] Storage bucket confirmed private
- [x] At least one real document ingested and successfully retrieved live
- [x] 2–3 consultants have used it end to end, no blocking issue

---

## Phase 2 — Immersion Day capability

**Status: new, in progress. 12-day build, hard external deadline: the first real immersion day is booked for day 14.**

### What this is

A consultant spends a full day onsite at a prospective client's organization, running one department interview at a time. For each department: paste in the interview transcript, get a workflow diagram of how work currently happens, see the bottlenecks in it, and get a branded, downloadable Opportunity Mapping PDF — tiered solutions with rationale, an estimate of time saved, and a second diagram showing the department transformed. After each department, the consultant chooses to continue to another or finish. Finishing generates one Comprehensive Report collating every department: before/after, and a 90-day roadmap per department.

**This is not an internal-only feature.** The PDFs this produces are handed to a real prospective client during the exact meeting meant to convert them into a paying engagement. Treat output quality and correctness here as doing sales work, not just internal reporting — a fabricated time-saved figure or an invented tool capability in one of these documents is a materially worse failure than an ungrounded chat answer ever was in the original MVP.

### Non-negotiable decisions for this phase

- **Transcript input is paste-in text only.** No audio recording, no live transcription. A consultant pastes a transcript from whatever note-taking tool they used during the interview.
- **Diagrams are custom-rendered using a fixed step-and-branch template, not a generic graph-layout engine.** Do not reach for React Flow, dagre, elk, or any auto-layout library. Model a workflow as an ordered sequence of steps with optional branching at decision points, and render it with one deliberately designed template component. This is a deliberate scope constraint to avoid the real risk of generic graph auto-layout eating the schedule on cosmetic edge cases — real department workflows from an interview are close to linear with occasional branches anyway, so this isn't a meaningful representational limitation.
- **Refactrd's real company brand is a separate design system from Compass's own internal one above.** The ink/off-white/brass/Plus-Jakarta-Sans-or-Fraunces system in this file is for Compass's own chat and admin UI only. Never use it in a Phase 2 PDF. The real Refactrd logo and a brand guideline PDF (typography, palette) live in `/brand` in this repo. The guideline PDF is a one-time human reference, not something the app parses at runtime — extract its actual hex codes and font names into a proper tokens file (e.g. `/brand/tokens.ts`) once, by hand or with a single one-off pass, and build the PDF templates against that file.
- **`Document` gets a `category` field** (`tools` / `stack` / `constraints` / `engineering-docs` / `general`) so solution-generation retrieval can target Refactrd's actual tooling and constraints specifically, rather than pulling from the whole undifferentiated knowledge base the way the original chat retrieval does.
- **Grounding discipline is absolute here.** Every solution recommendation and every time-saved figure must trace back to either the ingested Tools/Stack/Constraints/Engineering-Docs material or something stated in the transcript. Never state a specific efficiency percentage, tool capability, or timeline that isn't actually supported by that material. This is a stricter version of the grounding rule already in the System Prompt Structure section above, not a new principle — just higher-stakes here.
- **Autosave per completed department, not just at the end of an Engagement.** This runs live across a full working day at a client's office — losing a completed department's work to a crash partway through is a real, not hypothetical, risk worth designing against explicitly.

### Data model additions

- **`Engagement`** — one immersion day at one organization. Links to an existing `Client` record. Holds date, consultant, status (`in_progress` / `complete`).
- **`Department`** — belongs to an `Engagement`. Holds: the pasted transcript, the "before" workflow diagram (structured data, not just a rendered image), the extracted bottlenecks, the Opportunity Mapping (tiered solutions with rationale, time-saved estimates, the "after" diagram), the generated department PDF, and its own status.
- **`Document.category`** — added to the existing `Document` table, as above.
- The `Engagement`, once every `Department` is marked done, generates the Comprehensive Report — this can be a generated artifact rather than its own table, since it's fully derived from its Departments.

### AI pipeline, per department

1. Transcript in → structured workflow extraction (ordered steps, decision points, handoffs) → rendered as the "before" diagram via the fixed template
2. Bottleneck identification against that structure, grounded in retrieval the same way the main chat is
3. Opportunity generation: solutions tiered by priority (highest priority with full rationale for why it's the right solution; lowest priority as nice-to-have), retrieved specifically against the `tools`/`stack`/`constraints`/`engineering-docs` document categories
4. A second, "after" diagram: the same structure, transformed with those solutions applied
5. Time-saved estimation per bottleneck, feeding both the department PDF and the eventual Comprehensive Report

### Build sequence — Phase 2 (12 days)

**Days 1–2 — Foundation.** `Engagement` and `Department` tables plus RLS, linked to `Client`. `Document.category` added, existing admin Documents UI used to ingest the four new categories (Tools, Stack, Engineering Constraints, Engineering Docs). Real Refactrd brand assets (logo, guideline PDF) added to `/brand`, hand-extracted into `/brand/tokens.ts`.

**Days 3–5 — Transcript to "before" diagram.** Paste-in transcript UI. Extraction prompt: transcript → structured step-and-branch schema. The diagram template component rendering that schema, styled from `/brand/tokens.ts`. Get this solid in isolation before anything downstream depends on it — it's the riskiest new capability in this phase.

**Days 6–8 — Bottlenecks and Opportunity Mapping.** Bottleneck extraction against the workflow structure. Tiered solution generation grounded against the category-filtered documents. Time-saved estimation. The "after" diagram, same template, transformed state. The branded department-level PDF.

**Days 9–10 — The session flow.** Start an `Engagement`, work a `Department` through the full pipeline, the "continue to another department or finish" decision point, department PDF download. Autosave per completed department, per the non-negotiable above.

**Days 10–11 — Comprehensive Report.** Aggregation once an `Engagement` is marked complete: before/after per department, 90-day roadmap per department, one final collated branded PDF.

**Day 12 — Dry run.** One full fake `Engagement`, start to finish, with a real or realistic transcript. Check two different things, not just one: that the mechanics work (UI, PDFs render, downloads work), and that the generated content itself holds up — the solutions and time-saved figures read as genuinely grounded rather than generic or invented. The second check matters more here than the first, given what day 14 actually is.

Days 13–14 are reserve against this deadline, not additional scope. Do not pull "should have" work into them.

### Open questions — Phase 2

None outstanding. Transcript input, diagram rendering approach, and brand asset handling were all explicitly decided above before this section was written. If something genuinely new comes up while building (a library choice within an already-decided layer, an edge case in the extraction schema), make the call that fits the non-negotiable decisions above and the 12-day deadline, and note it in a comment rather than pausing to ask — same rule as the original MVP phase.

---

## Suggested project structure

```
/app
  /(consultant)          # chat workspace routes, gated to role=consultant or admin
    /engagements         # Phase 2: immersion day session flow
  /(admin)                # admin dashboard routes, gated to role=admin
  /api
    /conversations
    /messages
    /documents
    /admin
    /engagements          # Phase 2: engagement/department endpoints
/lib
  /ai
    client.ts             # single Anthropic wrapper — see "model-calling isolation" above
    system-prompt.ts
    retrieval.ts
    extraction.ts          # client-context extraction pass
  /immersion               # Phase 2
    transcript-extraction.ts   # transcript -> structured workflow schema
    diagram-schema.ts          # the step-and-branch data shape, shared by before/after diagrams
    opportunity-mapping.ts     # tiered solution generation, grounded against Document.category
/components
  /chat
  /admin
  /immersion               # Phase 2: diagram template component, department flow UI
/brand                     # Phase 2: real Refactrd logo, brand guideline PDF (reference only), tokens.ts
  logo.*
  brand-guideline.pdf
  tokens.ts
/supabase
  /migrations              # schema + RLS policies, versioned — Phase 2 adds Engagement/Department/Document.category here
/design
  *.png / *.jpg              # Figma Community reference screenshots — style reference only, see "Design references". Not to be confused with /brand.
docs/
  system-design.md          # full reference doc
CLAUDE.md                   # this file
```

When creating new components, note the folder/file path they belong in per the structure above rather than defaulting to wherever's convenient.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->