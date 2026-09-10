-- Compass — move everything into a dedicated `compass` schema.
--
-- Why this exists
-- ---------------
-- The Supabase project is shared with an earlier Refactrd product, which owns
-- `public.documents` (28 rows, its own `chunks` table, its own policies) and a
-- `documents` storage bucket. Migration 0001 used `create table if not exists`,
-- which silently did nothing for `documents`, so Compass never got that table
-- while its policies and a foreign key landed on the other product's.
--
-- Sharing `public` between two products means every future `create table` on
-- either side is a coin flip. A dedicated schema removes the whole class of
-- problem, so Compass owns `compass.*` and touches nothing in `public`.
--
-- After running this, add `compass` to Exposed Schemas in
-- Supabase → Settings → API, or PostgREST will not serve these tables.
--
-- Safe to re-run.

create schema if not exists compass;

-- PostgREST and the app connect as these roles. A new schema gets none of the
-- default privileges Supabase applies to `public`, so they are granted here.
-- `anon` is deliberately excluded: Compass has no unauthenticated data access.
grant usage on schema compass to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Move the six tables that 0001 created correctly
--
-- Indexes, constraints and RLS policies travel with the table. The policies
-- are rebuilt further down anyway, because their bodies call helper functions
-- that are also moving.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'clients', 'conversations', 'messages',
    'document_chunks', 'usage_events'
  ] loop
    if exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = t
    ) and not exists (
      select 1 from pg_tables where schemaname = 'compass' and tablename = t
    ) then
      execute format('alter table public.%I set schema compass', t);
    end if;
  end loop;
end $$;

-- Enums move too. Columns reference types by OID, so this does not rewrite any
-- data, but it keeps `public` free of Compass-owned names like `user_role`.
do $$
declare
  ty text;
begin
  foreach ty in array array[
    'user_role', 'user_status', 'message_role', 'document_status'
  ] loop
    if exists (
      select 1 from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = ty
    ) and not exists (
      select 1 from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'compass' and t.typname = ty
    ) then
      execute format('alter type public.%I set schema compass', ty);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Helper functions, rebuilt against compass.users
--
-- These run with `set search_path = ''`, so every reference inside is fully
-- qualified. That is what makes them safe, and also what means they break the
-- moment the table they name moves. Hence new definitions rather than
-- `alter function ... set schema`.
-- ---------------------------------------------------------------------------

create or replace function compass.current_user_role()
returns compass.user_role
language sql stable security definer set search_path = ''
as $$ select u.role from compass.users u where u.id = (select auth.uid()); $$;

create or replace function compass.current_user_status()
returns compass.user_status
language sql stable security definer set search_path = ''
as $$ select u.status from compass.users u where u.id = (select auth.uid()); $$;

create or replace function compass.is_active_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from compass.users u
    where u.id = (select auth.uid()) and u.status = 'active'
  );
$$;

create or replace function compass.is_active_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from compass.users u
    where u.id = (select auth.uid())
      and u.status = 'active' and u.role = 'admin'
  );
$$;

create or replace function compass.set_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;

grant execute on function
  compass.current_user_role(), compass.current_user_status(),
  compass.is_active_member(), compass.is_active_admin()
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. documents — the table that never got created
-- ---------------------------------------------------------------------------

create table if not exists compass.documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  storage_path  text not null,
  uploaded_by   uuid references compass.users (id) on delete set null,
  status        compass.document_status not null default 'active',
  uploaded_at   timestamptz not null default now()
);

create index if not exists documents_status_idx on compass.documents (status);

-- document_chunks still points at public.documents, the other product's table.
-- Deleting one of their rows would cascade into Compass chunks. Repoint it.
do $$
declare
  fk text;
begin
  select con.conname into fk
  from pg_constraint con
  join pg_class child on child.oid = con.conrelid
  join pg_namespace cn on cn.oid = child.relnamespace
  join pg_class parent on parent.oid = con.confrelid
  join pg_namespace pn on pn.oid = parent.relnamespace
  where con.contype = 'f'
    and cn.nspname = 'compass' and child.relname = 'document_chunks'
    and parent.relname = 'documents' and pn.nspname <> 'compass';

  if fk is not null then
    execute format(
      'alter table compass.document_chunks drop constraint %I', fk);
  end if;

  if not exists (
    select 1 from pg_constraint con
    join pg_class child on child.oid = con.conrelid
    join pg_namespace cn on cn.oid = child.relnamespace
    join pg_class parent on parent.oid = con.confrelid
    join pg_namespace pn on pn.oid = parent.relnamespace
    where con.contype = 'f'
      and cn.nspname = 'compass' and child.relname = 'document_chunks'
      and pn.nspname = 'compass' and parent.relname = 'documents'
  ) then
    alter table compass.document_chunks
      add constraint document_chunks_document_id_fkey
      foreign key (document_id) references compass.documents (id)
      on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Row level security, rebuilt on compass.*
--
-- Same boundaries as 0001, restated against the moved tables and functions.
-- ---------------------------------------------------------------------------

alter table compass.users enable row level security;
alter table compass.clients enable row level security;
alter table compass.conversations enable row level security;
alter table compass.messages enable row level security;
alter table compass.documents enable row level security;
alter table compass.document_chunks enable row level security;
alter table compass.usage_events enable row level security;

grant select, insert, update, delete on all tables in schema compass
  to authenticated, service_role;
alter default privileges in schema compass
  grant select, insert, update, delete on tables to authenticated, service_role;

-- users --------------------------------------------------------------------
drop policy if exists users_select_self_or_admin on compass.users;
create policy users_select_self_or_admin
  on compass.users for select to authenticated
  using ((select auth.uid()) = id or compass.is_active_admin());

-- clients ------------------------------------------------------------------
drop policy if exists clients_select_active_members on compass.clients;
create policy clients_select_active_members
  on compass.clients for select to authenticated
  using (compass.is_active_member());

drop policy if exists clients_insert_active_members on compass.clients;
create policy clients_insert_active_members
  on compass.clients for insert to authenticated
  with check (compass.is_active_member() and created_by = (select auth.uid()));

drop policy if exists clients_update_active_members on compass.clients;
create policy clients_update_active_members
  on compass.clients for update to authenticated
  using (compass.is_active_member())
  with check (compass.is_active_member());

drop policy if exists clients_delete_admin on compass.clients;
create policy clients_delete_admin
  on compass.clients for delete to authenticated
  using (compass.is_active_admin());

-- conversations ------------------------------------------------------------
drop policy if exists conversations_select_own on compass.conversations;
create policy conversations_select_own
  on compass.conversations for select to authenticated
  using ((select auth.uid()) = user_id and compass.is_active_member());

drop policy if exists conversations_insert_own on compass.conversations;
create policy conversations_insert_own
  on compass.conversations for insert to authenticated
  with check ((select auth.uid()) = user_id and compass.is_active_member());

drop policy if exists conversations_update_own on compass.conversations;
create policy conversations_update_own
  on compass.conversations for update to authenticated
  using ((select auth.uid()) = user_id and compass.is_active_member())
  with check ((select auth.uid()) = user_id and compass.is_active_member());

drop policy if exists conversations_delete_own on compass.conversations;
create policy conversations_delete_own
  on compass.conversations for delete to authenticated
  using ((select auth.uid()) = user_id and compass.is_active_member());

-- messages -----------------------------------------------------------------
drop policy if exists messages_select_own_conversation on compass.messages;
create policy messages_select_own_conversation
  on compass.messages for select to authenticated
  using (
    exists (
      select 1 from compass.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    ) and compass.is_active_member()
  );

drop policy if exists messages_insert_own_conversation on compass.messages;
create policy messages_insert_own_conversation
  on compass.messages for insert to authenticated
  with check (
    exists (
      select 1 from compass.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    ) and compass.is_active_member()
  );

drop policy if exists messages_delete_own_conversation on compass.messages;
create policy messages_delete_own_conversation
  on compass.messages for delete to authenticated
  using (
    exists (
      select 1 from compass.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    ) and compass.is_active_member()
  );

-- documents ----------------------------------------------------------------
drop policy if exists documents_select_active_members on compass.documents;
create policy documents_select_active_members
  on compass.documents for select to authenticated
  using (compass.is_active_member());

drop policy if exists documents_write_admin on compass.documents;
create policy documents_write_admin
  on compass.documents for all to authenticated
  using (compass.is_active_admin())
  with check (compass.is_active_admin());

-- document_chunks ----------------------------------------------------------
drop policy if exists document_chunks_select_active_members on compass.document_chunks;
create policy document_chunks_select_active_members
  on compass.document_chunks for select to authenticated
  using (compass.is_active_member());

drop policy if exists document_chunks_write_admin on compass.document_chunks;
create policy document_chunks_write_admin
  on compass.document_chunks for all to authenticated
  using (compass.is_active_admin())
  with check (compass.is_active_admin());

-- usage_events -------------------------------------------------------------
drop policy if exists usage_events_select_own_or_admin on compass.usage_events;
create policy usage_events_select_own_or_admin
  on compass.usage_events for select to authenticated
  using (
    ((select auth.uid()) = user_id or compass.is_active_admin())
    and compass.is_active_member()
  );

-- ---------------------------------------------------------------------------
-- 5. Triggers, repointed
-- ---------------------------------------------------------------------------

drop trigger if exists clients_set_updated_at on compass.clients;
create trigger clients_set_updated_at
  before update on compass.clients
  for each row execute function compass.set_updated_at();

drop trigger if exists conversations_set_updated_at on compass.conversations;
create trigger conversations_set_updated_at
  before update on compass.conversations
  for each row execute function compass.set_updated_at();

create or replace function compass.handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into compass.users (id, email, role, status, invited_by)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::compass.user_role, 'consultant'),
    'invited',
    (new.raw_user_meta_data ->> 'invited_by')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Renamed from `on_auth_user_created`. That name is generic enough that another
-- product on this project could plausibly have used it, and 0001's
-- `drop trigger if exists` would have silently removed theirs.
drop trigger if exists compass_on_auth_user_created on auth.users;
create trigger compass_on_auth_user_created
  after insert on auth.users
  for each row execute function compass.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- 6. Storage — Compass gets its own private bucket
--
-- The `documents` bucket was created 2026-05-06 by the other product. 0001
-- added policies to it and would have uploaded into it. Both are undone here.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('compass-documents', 'compass-documents', false)
on conflict (id) do update set public = false;

drop policy if exists compass_documents_read_admin on storage.objects;
create policy compass_documents_read_admin
  on storage.objects for select to authenticated
  using (bucket_id = 'compass-documents' and compass.is_active_admin());

drop policy if exists compass_documents_write_admin on storage.objects;
create policy compass_documents_write_admin
  on storage.objects for insert to authenticated
  with check (bucket_id = 'compass-documents' and compass.is_active_admin());

drop policy if exists compass_documents_delete_admin on storage.objects;
create policy compass_documents_delete_admin
  on storage.objects for delete to authenticated
  using (bucket_id = 'compass-documents' and compass.is_active_admin());

-- ---------------------------------------------------------------------------
-- 7. Hand `public` back to the other product
--
-- Everything below removes something 0001 added to objects Compass does not
-- own. Nothing here touches that product's own data, policies or rows.
-- ---------------------------------------------------------------------------

drop policy if exists documents_select_active_members on public.documents;
drop policy if exists documents_write_admin on public.documents;

drop policy if exists documents_bucket_read_admin on storage.objects;
drop policy if exists documents_bucket_write_admin on storage.objects;
drop policy if exists documents_bucket_delete_admin on storage.objects;

-- The public helper functions are dropped last, once nothing references them.
-- `drop function if exists` refuses if a policy still depends on one, which is
-- the desired outcome: it means something above did not move.
drop function if exists public.current_user_role();
drop function if exists public.current_user_status();
drop function if exists public.is_active_member();
drop function if exists public.is_active_admin();
drop function if exists public.handle_new_auth_user() cascade;
drop function if exists public.set_updated_at() cascade;
