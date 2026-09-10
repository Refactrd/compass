-- RLS behaviour test with three real accounts: two consultants and an admin.
-- CLAUDE.md schedules the formal version for week 3 day 4; this is the smoke
-- test of what the migrations actually enforce, against the compass schema.

\set QUIET on
\pset tuples_only on
\pset format unaligned

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set ADM '33333333-3333-3333-3333-333333333333'
\set CONV_A 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set CONV_B 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

-- Clean slate so the file can be re-run.
delete from compass.messages;
delete from compass.conversations;
delete from compass.clients;
delete from compass.usage_events;
delete from compass.documents;
delete from compass.users;
delete from auth.users;

-- Accounts are created in auth.users only; the mirror trigger populates
-- compass.users, which is the invite path the admin dashboard will use.
insert into auth.users (id, email, raw_user_meta_data) values
  (:'A',   'a@refactrd.test', '{}'::jsonb),
  (:'B',   'b@refactrd.test', '{}'::jsonb),
  (:'ADM', 'admin@refactrd.test', '{"role":"admin"}'::jsonb);

select '--- trigger mirrored auth.users into compass.users ---';
select case when count(*) = 3 then 'PASS' else 'FAIL' end
       || ' — 3 profiles created' from compass.users;
select case when count(*) = 3 then 'PASS' else 'FAIL' end
       || ' — all default to status=invited' from compass.users where status = 'invited';
select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || ' — role=admin read from user metadata' from compass.users where role = 'admin';

-- Activate everyone (the real flow does this on first sign-in, week 1 day 3).
update compass.users set status = 'active';

-- Seed one conversation per consultant, as the service role would.
insert into compass.conversations (id, user_id, title) values
  (:'CONV_A', :'A', 'A engagement'),
  (:'CONV_B', :'B', 'B engagement');
insert into compass.messages (conversation_id, role, content) values
  (:'CONV_A', 'user', 'A private content'),
  (:'CONV_B', 'user', 'B private content');

grant usage on schema compass to authenticated;
grant all on all tables in schema compass to authenticated;

-- ===========================================================================
select '';
select '--- consultant B vs consultant A ---';
set role authenticated;
set request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — B cannot read A''s conversations'
from compass.conversations where user_id = '11111111-1111-1111-1111-111111111111';

select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — B cannot read A''s messages'
from compass.messages
where conversation_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || ' — B can read own conversation' from compass.conversations;

select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || ' — B can read own messages' from compass.messages;

do $$
declare n integer;
begin
  update compass.conversations set title = 'hijacked'
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics n = row_count;
  raise notice '% — B cannot update A''s conversation (% rows)',
    case when n = 0 then 'PASS' else 'FAIL' end, n;
end $$;

do $$
begin
  insert into compass.messages (conversation_id, role, content)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user', 'injected');
  raise notice 'FAIL — B inserted a message into A''s conversation';
exception when insufficient_privilege then
  raise notice 'PASS — B blocked from inserting into A''s conversation';
end $$;

do $$
declare n integer;
begin
  delete from compass.conversations
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics n = row_count;
  raise notice '% — B cannot delete A''s conversation (% rows)',
    case when n = 0 then 'PASS' else 'FAIL' end, n;
end $$;

-- ===========================================================================
select '';
select '--- admin has no read-through to conversations ---';
set request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333"}';

select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — admin cannot read consultant conversations' from compass.conversations;
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — admin cannot read consultant messages' from compass.messages;
select case when count(*) = 3 then 'PASS' else 'FAIL' end
       || ' — admin CAN read the full user roster' from compass.users;

-- ===========================================================================
select '';
select '--- clients are shared, by design ---';
set request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
insert into compass.clients (name, industry, created_by)
values ('Northwind Ltd', 'Logistics', '11111111-1111-1111-1111-111111111111');

set request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || ' — B can read a client A created' from compass.clients;

do $$
declare n integer;
begin
  update compass.clients set notes = 'edited by B';
  get diagnostics n = row_count;
  raise notice '% — B can edit a client A created (% rows)',
    case when n = 1 then 'PASS' else 'FAIL' end, n;
end $$;

do $$
declare n integer;
begin
  delete from compass.clients;
  get diagnostics n = row_count;
  raise notice '% — consultant cannot delete a client (% rows)',
    case when n = 0 then 'PASS' else 'FAIL' end, n;
end $$;

-- ===========================================================================
select '';
select '--- rate limit counter is not client-writable ---';
do $$
begin
  insert into compass.usage_events (user_id, date, count)
  values ('22222222-2222-2222-2222-222222222222', current_date, 0);
  raise notice 'FAIL — consultant inserted a usage_events row';
exception when insufficient_privilege then
  raise notice 'PASS — consultant blocked from inserting usage_events';
end $$;

reset role;
insert into compass.usage_events (user_id, date, count)
values (:'B', current_date, 19);
set role authenticated;
set request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || ' — B can read own counter' from compass.usage_events;

do $$
declare n integer;
begin
  update compass.usage_events set count = 0;
  get diagnostics n = row_count;
  raise notice '% — B cannot reset own counter (% rows)',
    case when n = 0 then 'PASS' else 'FAIL' end, n;
end $$;

-- ===========================================================================
select '';
select '--- knowledge base is admin-write only ---';
do $$
begin
  insert into compass.documents (title, storage_path)
  values ('forged', 'x/y.pdf');
  raise notice 'FAIL — consultant inserted a document';
exception when insufficient_privilege then
  raise notice 'PASS — consultant blocked from inserting a document';
end $$;

set request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333"}';
do $$
begin
  insert into compass.documents (title, storage_path)
  values ('Refactrd methodology', 'docs/method.pdf');
  raise notice 'PASS — admin can insert a document';
exception when others then
  raise notice 'FAIL — admin blocked from inserting a document: %', sqlerrm;
end $$;

set request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || ' — consultant can read document titles for source attribution'
from compass.documents;

-- ===========================================================================
select '';
select '--- disabling an account cuts database access ---';
reset role;
update compass.users set status = 'disabled' where id = :'B';
set role authenticated;
set request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — disabled B cannot read own conversations' from compass.conversations;
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — disabled B cannot read clients' from compass.clients;
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — disabled B cannot read documents' from compass.documents;

reset role;
