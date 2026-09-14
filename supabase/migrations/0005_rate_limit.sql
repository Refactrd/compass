-- Compass — atomic daily usage increment.
--
-- CLAUDE.md: "20 questions per consultant per day, UTC reset, enforced
-- server-side against a UsageEvent table, never trusted from the client."
--
-- compass.usage_events already has no insert or update policy (0001), so the
-- browser cannot write it under any circumstance. That is the real
-- enforcement. This function exists for a narrower reason: without it, the
-- API route would do a read-modify-write from the application (select count,
-- add one, write count), and two requests racing on the same user and day
-- could both read the same starting count and one increment would be lost.
-- At 20 requests/day that race is unlikely, but the fix costs one function.
--
-- SECURITY DEFINER, and execute is granted to service_role only, not
-- authenticated. A consultant cannot call this directly even though it only
-- ever increments; the daily count is server-controlled end to end.
--
-- Safe to re-run.

create or replace function compass.increment_daily_usage(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = compass, public
as $$
declare
  new_count integer;
begin
  insert into compass.usage_events (user_id, date, count)
  values (p_user_id, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, date)
  do update set count = compass.usage_events.count + 1
  returning count into new_count;

  return new_count;
end;
$$;

revoke all on function compass.increment_daily_usage(uuid) from public, authenticated;
grant execute on function compass.increment_daily_usage(uuid) to service_role;

comment on function compass.increment_daily_usage is
  'Atomically increments today''s (UTC) usage count for a user and returns the new total. service_role only — never callable from the browser.';
