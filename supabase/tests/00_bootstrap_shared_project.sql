-- Bootstrap variant that reproduces the real project's condition: another
-- product already owns `public.documents` and the `documents` storage bucket.
--
-- Running 0001 against this makes `create table if not exists public.documents`
-- silently do nothing, exactly as it did in production. 0002 has to recover
-- from that, so this is the fixture it gets tested against.

\i /tmp/00_bootstrap.sql

-- The other product's document registry, with its own shape and its own rows.
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  file_url     text,
  status       text not null default 'indexed',
  chunk_count  integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

insert into public.documents (name, status, chunk_count) values
  ('00_company_overview.txt', 'indexed', 5),
  ('01_employee_handbook.txt', 'indexed', 6),
  ('03_leave_and_absence_policy.txt', 'indexed', 8)
on conflict do nothing;

alter table public.documents enable row level security;

-- Their world-readable policies, the ones found on day one.
drop policy if exists "Allow all documents" on public.documents;
create policy "Allow all documents"
  on public.documents for all using (true) with check (true);

drop policy if exists "Allow read documents" on public.documents;
create policy "Allow read documents"
  on public.documents for select using (true);

-- Their storage bucket, predating Compass.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
