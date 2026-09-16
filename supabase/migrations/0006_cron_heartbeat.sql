-- -----------------------------------------------------------------------------
-- cron_heartbeat
--
-- Supabase pauses a project on the free/hobby tier after 7 days with no
-- database activity. A single row, upserted by a daily Vercel Cron job hitting
-- app/api/cron/keep-alive, is enough real write traffic to keep that from ever
-- happening. Nothing in the app reads this table; it exists only to be written
-- to, and to let an admin glance at when the cron last actually ran.
--
-- RLS is enabled with no policies at all, on purpose, same as the write side of
-- usage_events: nobody using the anon or authenticated role can read or write
-- this table, only the service role (which bypasses RLS) can, and the cron
-- route is the only thing that ever calls it.
-- -----------------------------------------------------------------------------

create table if not exists compass.cron_heartbeat (
  id            boolean primary key default true,
  ping_count    integer not null default 0,
  last_pinged_at timestamptz not null default now(),
  constraint cron_heartbeat_single_row check (id)
);

alter table compass.cron_heartbeat enable row level security;

insert into compass.cron_heartbeat (id) values (true)
on conflict (id) do nothing;
