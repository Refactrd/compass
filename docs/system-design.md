# Refactrd Consultant Intelligence Platform
## System Design Reference

**Status:** Design complete, ready for development
**Timeline:** 2 weeks
**Budget:** Tight — technology choices optimized accordingly
**Scope:** Fresh, standalone internal build. Not tied to any other Refactrd project.

---

## 1. Product Understanding

**Purpose.** An internal tool that lets Refactrd consultants reason through a client engagement the way Refactrd's own methodology dictates, grounded in Refactrd's actual knowledge base rather than generic AI output. The value isn't the chat interface, it's that the system holds the organization-to-outcome reasoning chain and refuses to skip from a stated problem straight to a solution.

**Users.** Refactrd consultants (no fixed seat count — admin invites as many as needed, no minimum or maximum). One admin managing accounts and ingested knowledge through a dashboard.

**Core workflows.**
1. A consultant opens a conversation and describes a client situation in natural language, at whatever level of detail they have.
2. The system asks diagnostic follow-up questions when the information given doesn't yet support a recommendation, rather than guessing.
3. Once enough is known, the system maps the finding to a Refactrd service area, suggests an intervention at the smallest sufficient maturity level, and cites the Refactrd source material it drew on.
4. The consultant can return to that conversation later, and separately manage a running set of client contexts across engagements.
5. The admin ingests new Refactrd methodology or case material through a dashboard so the knowledge base grows without a redeploy.

**Core intelligence.** The reasoning chain — organization → function → workflow → bottleneck → evidence → impact → intervention → adoption → outcome — combined with the maturity ladder (clarify → improve → assist → integrate → operationalize → transform), enforced through the system prompt and retrieval, not left to the model's default behavior.

**Business value.** Consistency. The reasoning discipline currently lives in one person's head. This makes it usable by anyone with an account, and makes Refactrd's own methodology into an asset instead of tacit knowledge.

**Key constraints.** 3-week build, tight budget, no seat cap, 20 questions per consultant per day, admin-driven account creation via invite, self-service document ingestion via admin UI.

**Assumptions.**
- The 20-question daily cap resets per user at UTC midnight and applies uniformly, no per-role variation for now.
- The knowledge base at launch is whatever Refactrd source material already exists and is approved. Nobody is writing new methodology docs specifically to seed this.
- A "Client" in this tool is informal context a consultant types in, not a separately access-controlled entity. Any consultant can create or read any Client record.
- This tool doesn't talk to any other Refactrd system (CRM, email, the website advisor agent) at launch. Standalone.

---

## 2. Requirements Specification

### Functional — Must have
- Admin invites a consultant by email; consultant sets their own password on first login
- Admin can disable or delete a consultant account, with active sessions revoked immediately
- Login, logout, forgotten-password reset
- Start a conversation in free text, no form-first flow
- System asks diagnostic follow-up questions when information is insufficient
- Retrieval against ingested Refactrd knowledge, with source Document titles shown alongside responses
- Responses stream, with three real activity states tied to actual pipeline stages
- One overall confidence indicator per response
- Output matches what's asked for (table, email, decision memo, plain prose by default)
- Follow-up question chips, clickable to send as the next message
- Cold-start starting points on an empty conversation
- Client context (name, industry, size, notes) auto-extracted from conversation, editable inline in a context panel
- Fuzzy name match against existing Clients, one-click confirm before linking two conversations to the same Client, never silent auto-merge
- View, return to, delete own conversations; search by title
- Admin dashboard: Users (invite/disable/delete/view daily count), Documents (upload/chunk+embed/deactivate), Usage (per-consultant question counts)
- 20 questions/consultant/day, enforced server-side, visible counter, clear message when hit
- No consultant can read another consultant's conversations

### Functional — Should have (planned fast-follow)
- Full audit logging
- Dedicated observability (Sentry or similar)
- AI evaluation framework with a real test dataset
- Prompt injection defenses beyond baseline input validation
- Abuse detection beyond the daily counter (burst protection, concurrent-request limits)
- Conversation summarization for long threads
- Per-claim confidence labeling (Known / Supported / Inferred / Hypothesis / Unknown)
- 90–180 day roadmap generation
- Document versioning
- Formal row-level security policy review as usage patterns become real

### Functional — Could have
- Guided cold-start tutorial beyond simple starting-point prompts
- Multi-format export of conversations or roadmaps
- Dedicated transactional email service (only if Supabase's built-in email proves insufficient)

### Functional — Not now
- Multi-tenant, per-client access controls beyond shared informal Client context
- Tool-calling or multi-agent orchestration
- Formal penetration testing
- A dedicated vector database separate from pgvector
- Any microservices split of the current single Next.js application

### Non-functional
- Supports concurrent use by all active consultants without degradation at realistic scale
- Streaming begins within a couple seconds of submission, retrieval latency included
- Usable with a clear error state if the AI provider or retrieval briefly fails

### Security
- Passwords never stored in plaintext (handled by Supabase Auth, not custom code)
- Sessions expire and are invalidated immediately when an admin disables a user
- Basic input validation on all submitted text before it reaches the model or database

### AI
- Reasoning hierarchy and maturity ladder enforced via system prompt, not implicit
- No fabricated sources; empty retrieval is stated plainly, not papered over
- Explicit "not enough information yet" responses when appropriate

### UX
- Consultant workspace: sidebar with history, main chat panel, sources alongside responses
- Admin dashboard: separate view, user list, document list, per-user usage
- No emojis, no chatbot visual clichés

### Administrative
- Invite, disable, delete, view usage, manage documents — all via dashboard

### Data
- User, Client, Conversation, Message, Document, DocumentChunk, UsageEvent
- No versioned documents, no audit-trail entities, no separate memory-type taxonomy at MVP

---

## 3. System Architecture

**Stack:** Next.js on Vercel (frontend + API routes together). Supabase for Postgres, pgvector, Auth, and Storage. Anthropic API for the model. No separate backend service, no dedicated vector database, no microservices.

```
Consultant / Admin (browser)
        |
   Next.js frontend (chat UI, admin dashboard)
        |
   Next.js API routes
        |
   +----+----------------+------------------+
   |                     |                  |
Supabase Auth      Supabase Postgres    Anthropic API
(sessions,          + pgvector           (streaming
 invites)            (users, docs,        completions)
                      chunks, convos,
                      usage events)
```

**Request lifecycle for a consultant question:**
1. Browser sends the question to an API route, session token attached.
2. API route validates the session, checks UsageEvent count for that user/day. Over limit → clear "daily limit reached" response, no model call made.
3. Under limit → embed the question, query pgvector for top relevant chunks (filtered to `Document.status = active`).
4. Assemble the prompt: system instructions + retrieved chunks + client context + recent history + the question.
5. Call Anthropic API with streaming enabled.
6. Stream tokens back, alongside real activity-state markers as each stage completes.
7. On completion: write the message pair to Message, increment UsageEvent, attach source chunk references, run the client-context extraction pass.

**AI orchestration.** One system prompt, four fixed sections (identity/scope, methodology, output rules, grounding rules) plus two dynamic sections assembled per request (retrieved knowledge, conversation context). Not a multi-layer orchestration architecture — unjustified complexity with one model provider and no tool-calling requirement.

**RAG architecture.** Document → chunked on ingestion → embedded → stored with a pgvector column on DocumentChunk. Similarity query scoped to active documents. No versioning, no separate namespaces — there's one shared knowledge base with no cross-client isolation requirement.

**Memory architecture.** Conversation history (Message table) plus one lightweight Client-context object per conversation. No separate ConversationSummary or consultant-level memory layer at MVP.

**Auth architecture.** Supabase Auth handles password hashing, sessions, password reset. Admin-initiated invite triggers a Supabase invite link; consultant sets their own password on first click. Disabling a user revokes their active session immediately.

**Security, right-sized.** Server-side input validation, server-side rate-limit enforcement, session checks on every API route. No audit logging or dedicated threat-detection layer at MVP.

---

## 4. Technology Decision Record

| Layer | Recommendation | Why |
|---|---|---|
| Frontend + Backend | Next.js on Vercel | One codebase, one deploy, streaming works natively. Splitting frontend/backend adds coordination overhead with no benefit at this scale and team size. |
| Database, vector retrieval, auth, storage | Supabase (Postgres + pgvector + Auth + Storage) | One vendor instead of four. A dedicated vector database is real over-engineering at this document volume — pgvector in the same instance performs fine and avoids syncing data across systems. |
| AI provider | Anthropic API | Existing Refactrd familiarity (used in other products). Strong instruction-following for the structured reasoning this system needs. Model-calling code kept behind a thin wrapper to avoid hard lock-in without building a full abstraction layer. |
| Email (invites, resets) | Supabase built-in | Zero additional setup or cost. Swappable to Resend later if deliverability becomes a real problem. |
| Observability | Vercel + Supabase built-in logs | A dedicated platform (Sentry, Datadog) is a fast-follow once real usage patterns exist to watch, not a week-1–3 requirement. |

**Cost, scalability, operational complexity:** all choices sit comfortably within a tight budget and low operational overhead at current scale (uncapped seats, low daily question volume). Nothing here blocks growth into a larger deployment later — the constraint at that point would surface in the database or model API layer first, not in this stack's basic structure.

---

## 5. Data Model

**User** — id, email, role (`admin`/`consultant`), status (`invited`/`active`/`disabled`), created_at, invited_by
**Client** — id, name, industry, size, notes, created_by, created_at *(shared across consultants, no ownership boundary — deliberate)*
**Conversation** — id, user_id (FK, owner), client_id (FK, nullable), title, created_at, updated_at
**Message** — id, conversation_id (FK), role (`user`/`assistant`), content, source_chunk_ids (array, nullable), created_at
**Document** — id, title, storage_path, uploaded_by, status (`active`/`deactivated`), uploaded_at
**DocumentChunk** — id, document_id (FK), content, embedding (pgvector), chunk_index
**UsageEvent** — id, user_id (FK), date, count — unique constraint on (user_id, date)

```
User 1---* Conversation 1---* Message
User 1---* Client (creator, not owner)
Conversation *---1 Client (nullable)
Document 1---* DocumentChunk
User 1---* UsageEvent (one row per day)
Message *---* DocumentChunk (via source_chunk_ids)
```

**Collapsed from the original spec, deliberately:** Invitation is a status on User, not its own table (Supabase Auth already tracks it). Source is an array field on Message, not its own table (promote later only if sources need an independent lifecycle).

**Enforced ownership boundaries:** Conversation and Message — strictly scoped to owning User via row-level security. UsageEvent — server-write only. Document/DocumentChunk — admin-write only. Client — no boundary, by design.

**Indexes:** pgvector index (hnsw) on DocumentChunk.embedding; standard FK/lookup indexes on Conversation.user_id, Message.conversation_id, UsageEvent(user_id, date).

---

## 6. AI Intelligence Architecture

**System prompt, four fixed sections + two dynamic:**
1. Identity and scope — what this is, what it isn't, redirect instruction for out-of-scope requests
2. Methodology — the reasoning hierarchy and maturity ladder, stated as rules
3. Output rules — match requested format, default to plain prose, no forced template
4. Grounding rules — never state fact without retrieval or conversation support; say explicitly when information is insufficient
5. *(dynamic)* Retrieved knowledge — top pgvector matches, tagged by source Document
6. *(dynamic)* Conversation context — Client record fields + recent history

**Client-context extraction.** After each user message, a structured-output pass diffs new facts against the existing Client record and updates it. On a new company name: fuzzy-match against existing Clients; if a plausible match is found, surface a one-click link-confirmation in the context panel rather than auto-merging silently.

**Next-best-question logic.** Not a separate system — the methodology section instructs the model to check what's known against what the reasoning hierarchy requires at the current stage, and ask for the single most-informative missing piece.

**Source attribution.** Chunks actually used are written to Message.source_chunk_ids, displayed as source Document titles, expandable to see which point drew from which source.

**Hallucination controls (MVP-level).** Grounding rule in the system prompt + empty-retrieval fallback (stated plainly, not papered over). A separate post-generation verification pass is deferred.

**Confidence indication.** One overall signal per response, stated in prose ("based on limited information"), not per-claim tagging or a numeric score.

---

## 7. UX Architecture

**Navigation:** Consultant workspace and Admin dashboard as two entirely separate views, gated by role — admin controls never rendered for a consultant.

**Consultant sidebar:** new conversation, search, conversation list (grouped by recency), account menu.

**Consultant main panel:** chat center; collapsible right-side context panel showing the active Client record, editable inline, including the link-confirmation prompt when a name match is found. Below the input: follow-up question chips. On empty conversations: cold-start starting points. Responses show source Document titles (expandable) and a one-line confidence indicator.

**Activity states while streaming:** three, tied to real pipeline stages — retrieving sources, analyzing, preparing response.

**Daily limit indicator:** persistent counter near the input ("14 of 20 questions today"); input disables with a clear message and reset time when hit.

**Admin — Users:** table (email, status, date invited, today's question count); actions: invite, disable, delete.
**Admin — Documents:** upload control, table (title, upload date, status), deactivate/reactivate toggle.
**Admin — Usage:** per-consultant question counts, current week/month — the one place a chart beats a table.

**Error states:**
- AI provider unavailable → pending message stays visible with retry
- Empty retrieval → response still generates, states plainly it's unsourced
- Rate limit hit → clear message, states reset time
- Disabled mid-session → redirected to a plain access-revoked screen

**Visual language:** no purple-heavy palette, no glassmorphism, no robot/chatbot imagery, a deliberate typography choice made once at design time.

---

## 8. Security & Threat Model

**Assets, in priority order:** consultant credentials/sessions → ingested Refactrd knowledge base → conversation and client content → usage/rate-limit data → API keys and service credentials. No regulated data (health, financial, government ID) by design.

| Threat | Vector | Control |
|---|---|---|
| Credential theft | Phishing, weak passwords | Supabase Auth handles hashing/sessions |
| Cross-user data access | Manipulated conversation_id in a direct API call | Row-level security at the database layer |
| Disabled user retains access | Session not invalidated | Active session revoked immediately on disable |
| API key exposure | Server key bundled client-side by mistake | Keys referenced only in API routes, checked before deploy |
| Prompt injection via a document | Malicious ingested content | Retrieved content delimited as reference data, not instructions; low risk since only admins ingest |
| Prompt injection via user input | Adversarial consultant input | Baseline input validation + scope-redirect instruction; full defense explicitly deferred |
| Rate-limit bypass | Client-side manipulation | Enforced server-side against UsageEvent, never trusted from the browser |
| Burst abuse | Rapid-fire requests | Not defended beyond the daily cap — accepted gap, not hidden |
| Document exposure | Guessed storage URL | Private bucket, authenticated access only |
| Wrong Client-link merge | Auto-link mismatch | Confirm-before-link, never silent auto-merge |

**Explicitly deferred:** formal audit trail, automated abuse-pattern detection, dedicated prompt-injection test suite, penetration testing. Reasonable given the actual content at stake (internal methodology, not client PII or financial data) — revisit once the tool is live and the risk is no longer hypothetical.

---

## 9. MVP Scope

See Section 2 above for the full Must/Should/Could/Not-now breakdown — consolidated there rather than repeated, since Requirements and MVP Scope converged to the same list through the course of this design process.

---

## 10. Development Plan

**Sequencing principle:** account creation and the admin shell gate everything else, so they come before the chat interface despite the chat being the actual product.

### Week 1 — Foundation, accounts, ingestion shell
- Day 1–2: Project scaffold (Next.js/Vercel, Supabase project, pgvector enabled, all tables + RLS policies created alongside the tables)
- Day 3–4: Admin dashboard Users section — invite flow, disable/delete, session revocation tested explicitly
- Day 5: Admin dashboard Documents section — upload, chunk, embed pipeline, tested end to end

### Week 2 — Core conversation experience
- Day 1–2: Chat shell, streaming, conversation/message persistence, sidebar
- Day 3: Retrieval pipeline connected, sources shown in UI
- Day 4: System prompt built out, client-context extraction wired in, context panel
- Day 5: Fuzzy Client matching + link-confirmation UI, follow-up chips, cold-start prompts, real activity states

### Week 3 — Rate limiting, admin usage, hardening, real testing
- Day 1: Rate-limit enforcement live, UI counter, disabled-state messaging
- Day 2: Admin Usage section
- Day 3: Error-state pass against all four failure modes, each deliberately triggered
- Day 4: Security pass against the full threat model — RLS tested with two real accounts, keys confirmed server-side only, storage confirmed private
- Day 5: Deploy, real walkthrough with 2–3 consultants before wider rollout

**Testing strategy:** inline with each day's build rather than a separate test phase, given the timeline. Deliberate, structured testing reserved for RLS (week 3, day 4) since cross-user leakage is invisible until discovered the hard way. The week 3, day 5 walkthrough serves as both QA and cold-start validation. Load testing explicitly skipped — not a volume where it would surface anything Vercel/Supabase defaults don't already handle.

**Deployment:** single production environment, no separate staging for MVP — a real corner cut, justified by the timeline and internal-only audience. Staging environment recommended as an early Should-have addition once live.

### Production-readiness checklist (Week 3, Day 5 gate)
- [ ] All RLS policies tested with two real accounts, not just reviewed as code
- [ ] API keys confirmed absent from any client-side bundle
- [ ] Session revocation on disable confirmed working
- [ ] All four error states triggered and confirmed
- [ ] Rate limit confirmed enforced server-side (attempted client-side bypass fails)
- [ ] Storage bucket confirmed private
- [ ] At least one real document ingested and successfully retrieved in a live conversation
- [ ] 2–3 consultants have used it end to end with no blocking issue

---

## Deferred beyond MVP — full list

Audit logging · dedicated observability platform · AI evaluation framework with test dataset · prompt injection defenses beyond baseline validation · abuse detection beyond the daily counter · conversation summarization · per-claim confidence labeling · 90–180 day roadmap generation · document versioning · formal RLS policy review at scale · guided cold-start tutorial · multi-format export · dedicated transactional email service · penetration testing · dedicated vector database · staging environment