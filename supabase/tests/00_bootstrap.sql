-- Minimal stand-in for the parts of a Supabase project the migration depends
-- on. Not a Supabase clone — just enough surface to make the migration's
-- assumptions testable: auth.users, auth.uid(), storage.buckets/objects, the
-- extensions schema, and the anon/authenticated/service_role roles.

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

-- Reproduce the condition that broke the real run: pgvector already installed,
-- and NOT in the `extensions` schema.
create extension if not exists vector with schema public;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- Supabase reads the subject out of the request's JWT claims GUC.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub', ''
  )::uuid;
$$;

create table if not exists storage.buckets (
  id     text primary key,
  name   text,
  public boolean not null default false
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text
);
alter table storage.objects enable row level security;

grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- Supabase applies these default privileges to its own projects, so tables the
-- migration creates are reachable by `authenticated` before RLS is consulted.
-- Without them RLS would appear to work purely because GRANT was denying first.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
