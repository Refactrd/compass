-- Compass — initial schema and row-level security.
--
-- Structure of this file: every table is immediately followed by `enable row
-- level security` and its policies, per CLAUDE.md ("RLS policies should be
-- written at the same time as each table, not added afterward").
--
-- Ownership model (docs/system-design.md §5, "Enforced ownership boundaries"):
--   users            — read own row; admins read all; writes are service-role only
--   clients          — shared across all consultants, no ownership boundary (deliberate)
--   conversations    — strictly the owning user, admins included
--   messages         — strictly the owner of the parent conversation
--   documents        — all active members read; only admins write
--   document_chunks  — same as documents
--   usage_events     — read own row; admins read all; writes are service-role only

-- ---------------------------------------------------------------------------
-- Guard: superseded by 0002
--
-- 0002 moves every table below into the `compass` schema. Re-running this file
-- afterwards would find nothing in `public`, and its `create table if not
-- exists` statements would happily build a second, empty set of tables
-- shadowing the real ones. Fail loudly rather than do that quietly.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'compass') then
    raise exception
      'Migration 0001 is superseded by 0002. Compass now lives in the `compass` schema; re-running this would create empty duplicate tables in `public`.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

-- pgvector ships pre-installed on most Supabase projects, and its schema varies
-- by project age — `extensions` on current ones, `public` on older ones.
-- `create extension if not exists ... with schema` does NOT relocate an
-- extension that already exists; it is a silent no-op. So the schema cannot be
-- assumed, and `extensions.vector` fails with "type does not exist" wherever
-- the guess is wrong.
--
-- Install it into `extensions` if it is genuinely absent, then put both
-- candidates on the search_path and let `vector` resolve wherever it actually
-- lives. Column types and operator classes bind to a concrete OID at DDL time,
-- so nothing below depends on this search_path afterwards.
create extension if not exists vector with schema extensions;

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.user_role as enum ('admin', 'consultant');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Invite state lives here rather than in a separate Invitation table —
  -- Supabase Auth already owns the token itself (CLAUDE.md, "Data model").
  create type public.user_status as enum ('invited', 'active', 'disabled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_role as enum ('user', 'assistant');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_status as enum ('active', 'deactivated');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- users — table only
--
-- Hoisted above the auth helpers, breaking the table-then-policies order the
-- rest of this file follows. The helpers below are LANGUAGE SQL, and Postgres
-- resolves a SQL function body against the catalog at CREATE FUNCTION time
-- (check_function_bodies), so public.users must already exist or they fail with
-- 'relation "public.users" does not exist'. The plpgsql functions are not
-- validated that far, which is why only these four are affected.
--
-- This table's RLS policies stay in the users section further down, where they
-- belong — they call the helpers, so they have to come after them.
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  role        public.user_role not null default 'consultant',
  status      public.user_status not null default 'invited',
  created_at  timestamptz not null default now(),
  invited_by  uuid references public.users (id) on delete set null
);

comment on table public.users is
  'Application-level profile for each auth.users row. No seat cap is encoded anywhere.';

create index if not exists users_status_idx on public.users (status);

-- ---------------------------------------------------------------------------
-- Auth helpers
--
-- These are security definer so they can read public.users without triggering
-- that table's own RLS policies, which would recurse. `set search_path = ''`
-- forces every reference inside to be schema-qualified, so the function cannot
-- be hijacked by a caller-controlled search_path.
-- ---------------------------------------------------------------------------

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select u.role from public.users u where u.id = (select auth.uid());
$$;

create or replace function public.current_user_status()
returns public.user_status
language sql
stable
security definer
set search_path = ''
as $$
  select u.status from public.users u where u.id = (select auth.uid());
$$;

-- An account that has been disabled mid-session loses database access here,
-- independent of whether its JWT has expired yet. Session revocation on the
-- auth side is built in week 1 day 3-4; this is the backstop underneath it.
create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = (select auth.uid()) and u.status = 'active'
  );
$$;

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.status = 'active'
      and u.role = 'admin'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- users — row-level security
--
-- The table itself is created above the auth helpers; see the note there for
-- why it is the one table split across two places in this file.
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;

-- A consultant can see only themselves; an admin can see the whole roster for
-- the admin Users table.
drop policy if exists users_select_self_or_admin on public.users;
create policy users_select_self_or_admin
  on public.users for select
  to authenticated
  using ((select auth.uid()) = id or public.is_active_admin());

-- No insert/update/delete policies. Invite, disable and delete all run through
-- admin API routes using the service-role key, which bypasses RLS. Nothing a
-- browser session holds can change a role or a status.

-- Mirror new auth users into public.users. The invite flow (week 1 day 3)
-- creates the auth user first, passing role and invited_by as user metadata.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, role, status, invited_by)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'consultant'),
    'invited',
    (new.raw_user_meta_data ->> 'invited_by')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- clients
--
-- Deliberately shared. Any active consultant may read or edit any client
-- record; this is a stated non-negotiable, not an oversight.
-- ---------------------------------------------------------------------------

create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  industry    text,
  size        text,
  notes       text,
  created_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.clients is
  'Informal engagement context, shared across all consultants by design.';

-- Supports the fuzzy name match that gates client linking (week 2 day 5).
create index if not exists clients_name_lower_idx on public.clients (lower(name));

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

alter table public.clients enable row level security;

drop policy if exists clients_select_active_members on public.clients;
create policy clients_select_active_members
  on public.clients for select
  to authenticated
  using (public.is_active_member());

drop policy if exists clients_insert_active_members on public.clients;
create policy clients_insert_active_members
  on public.clients for insert
  to authenticated
  with check (public.is_active_member() and created_by = (select auth.uid()));

drop policy if exists clients_update_active_members on public.clients;
create policy clients_update_active_members
  on public.clients for update
  to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

-- Deletion is the one client action not covered by the "shared, editable by
-- anyone" decision, which speaks only to reading and editing. Held to admins
-- because a delete cascades context out of other consultants' conversations.
drop policy if exists clients_delete_admin on public.clients;
create policy clients_delete_admin
  on public.clients for delete
  to authenticated
  using (public.is_active_admin());

-- ---------------------------------------------------------------------------
-- conversations
--
-- Strictly per-user, admins included. "No consultant can read another
-- consultant's conversations" is absolute — there is no admin read-through.
-- ---------------------------------------------------------------------------

create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  client_id   uuid references public.clients (id) on delete set null,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists conversations_user_id_updated_at_idx
  on public.conversations (user_id, updated_at desc);
create index if not exists conversations_client_id_idx
  on public.conversations (client_id);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;

drop policy if exists conversations_select_own on public.conversations;
create policy conversations_select_own
  on public.conversations for select
  to authenticated
  using ((select auth.uid()) = user_id and public.is_active_member());

drop policy if exists conversations_insert_own on public.conversations;
create policy conversations_insert_own
  on public.conversations for insert
  to authenticated
  with check ((select auth.uid()) = user_id and public.is_active_member());

drop policy if exists conversations_update_own on public.conversations;
create policy conversations_update_own
  on public.conversations for update
  to authenticated
  using ((select auth.uid()) = user_id and public.is_active_member())
  with check ((select auth.uid()) = user_id and public.is_active_member());

drop policy if exists conversations_delete_own on public.conversations;
create policy conversations_delete_own
  on public.conversations for delete
  to authenticated
  using ((select auth.uid()) = user_id and public.is_active_member());

-- ---------------------------------------------------------------------------
-- messages
--
-- Ownership is inherited from the parent conversation. Every policy re-checks
-- it rather than trusting a denormalized user_id, so a forged conversation_id
-- in a direct API call fails at the database, not just in the UI.
-- ---------------------------------------------------------------------------

create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  role             public.message_role not null,
  content          text not null,
  -- Which chunks the answer drew on. An array rather than a join table:
  -- sources have no independent lifecycle at MVP (CLAUDE.md, "Data model").
  source_chunk_ids uuid[],
  created_at       timestamptz not null default now()
);

create index if not exists messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

drop policy if exists messages_select_own_conversation on public.messages;
create policy messages_select_own_conversation
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
    and public.is_active_member()
  );

drop policy if exists messages_insert_own_conversation on public.messages;
create policy messages_insert_own_conversation
  on public.messages for insert
  to authenticated
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
    and public.is_active_member()
  );

drop policy if exists messages_delete_own_conversation on public.messages;
create policy messages_delete_own_conversation
  on public.messages for delete
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
    and public.is_active_member()
  );

-- No update policy: messages are an append-only transcript.

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------

create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  storage_path  text not null,
  uploaded_by   uuid references public.users (id) on delete set null,
  status        public.document_status not null default 'active',
  uploaded_at   timestamptz not null default now()
);

create index if not exists documents_status_idx on public.documents (status);

alter table public.documents enable row level security;

-- Consultants read document rows so responses can name their sources.
drop policy if exists documents_select_active_members on public.documents;
create policy documents_select_active_members
  on public.documents for select
  to authenticated
  using (public.is_active_member());

drop policy if exists documents_write_admin on public.documents;
create policy documents_write_admin
  on public.documents for all
  to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

-- ---------------------------------------------------------------------------
-- document_chunks
--
-- Embedding dimension is 1024. Anthropic has no embeddings endpoint, so the
-- embedding provider is a separate choice; 1024 is chosen because it is a
-- native output width for Voyage (Anthropic's recommended partner) and is also
-- reachable by OpenAI's text-embedding-3-* via their `dimensions` parameter.
-- Picking a width both can produce keeps the provider swappable without a
-- re-embed. The provider itself gets wired in week 1 day 5 with the ingestion
-- pipeline; changing the width later means rebuilding this table's vectors.
-- ---------------------------------------------------------------------------

create table if not exists public.document_chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents (id) on delete cascade,
  content      text not null,
  embedding    vector(1024),
  chunk_index  integer not null,
  created_at   timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists document_chunks_document_id_idx
  on public.document_chunks (document_id);

-- Cosine distance, matching normalized embeddings from either provider above.
create index if not exists document_chunks_embedding_idx
  on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

alter table public.document_chunks enable row level security;

drop policy if exists document_chunks_select_active_members on public.document_chunks;
create policy document_chunks_select_active_members
  on public.document_chunks for select
  to authenticated
  using (public.is_active_member());

drop policy if exists document_chunks_write_admin on public.document_chunks;
create policy document_chunks_write_admin
  on public.document_chunks for all
  to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

-- ---------------------------------------------------------------------------
-- usage_events
--
-- One row per user per UTC day. `date` is written by the server as
-- (now() at time zone 'utc')::date so the 20/day cap resets at UTC midnight.
-- ---------------------------------------------------------------------------

create table if not exists public.usage_events (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references public.users (id) on delete cascade,
  date     date not null,
  count    integer not null default 0 check (count >= 0),
  unique (user_id, date)
);

create index if not exists usage_events_date_idx on public.usage_events (date);

alter table public.usage_events enable row level security;

-- Read-only to the browser: a consultant sees their own counter, an admin sees
-- everyone's for the Usage section.
drop policy if exists usage_events_select_own_or_admin on public.usage_events;
create policy usage_events_select_own_or_admin
  on public.usage_events for select
  to authenticated
  using (
    ((select auth.uid()) = user_id or public.is_active_admin())
    and public.is_active_member()
  );

-- No insert/update/delete policies at all. Increments happen only through
-- service-role writes in API routes, which is what makes the daily cap
-- unbypassable from the client.

-- ---------------------------------------------------------------------------
-- Storage
--
-- Source documents live in a private bucket; nothing is served by public URL.
-- Uploads and deletes are admin-only, matching the documents table.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = false;

drop policy if exists documents_bucket_read_admin on storage.objects;
create policy documents_bucket_read_admin
  on storage.objects for select
  to authenticated
  using (bucket_id = 'documents' and public.is_active_admin());

drop policy if exists documents_bucket_write_admin on storage.objects;
create policy documents_bucket_write_admin
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents' and public.is_active_admin());

drop policy if exists documents_bucket_delete_admin on storage.objects;
create policy documents_bucket_delete_admin
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'documents' and public.is_active_admin());
