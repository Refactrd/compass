-- Structural verification of the Compass schema against a live project.
--
-- READ-ONLY. Creates nothing, changes nothing — safe to paste into the
-- Supabase SQL editor on production. Returns one row per check.
--
-- This proves the objects and policies are shaped correctly. It does not prove
-- the policies *behave* correctly; that is what supabase/tests/run.sh does,
-- against the same migration file, with three real accounts.

with expected_policies (tbl, policyname, cmd) as (
  values
    ('users',           'users_select_self_or_admin',            'SELECT'),
    ('clients',         'clients_select_active_members',         'SELECT'),
    ('clients',         'clients_insert_active_members',         'INSERT'),
    ('clients',         'clients_update_active_members',         'UPDATE'),
    ('clients',         'clients_delete_admin',                  'DELETE'),
    ('conversations',   'conversations_select_own',              'SELECT'),
    ('conversations',   'conversations_insert_own',              'INSERT'),
    ('conversations',   'conversations_update_own',              'UPDATE'),
    ('conversations',   'conversations_delete_own',              'DELETE'),
    ('messages',        'messages_select_own_conversation',      'SELECT'),
    ('messages',        'messages_insert_own_conversation',      'INSERT'),
    ('messages',        'messages_delete_own_conversation',      'DELETE'),
    ('documents',       'documents_select_active_members',       'SELECT'),
    ('documents',       'documents_write_admin',                 'ALL'),
    ('document_chunks', 'document_chunks_select_active_members', 'SELECT'),
    ('document_chunks', 'document_chunks_write_admin',           'ALL'),
    ('usage_events',    'usage_events_select_own_or_admin',      'SELECT')
),
expected_tables (tbl) as (
  values ('users'), ('clients'), ('conversations'), ('messages'),
         ('documents'), ('document_chunks'), ('usage_events')
),
checks (sort_key, check_name, ok, detail) as (

  -- Extension ---------------------------------------------------------------
  select 1, 'pgvector installed',
    exists (select 1 from pg_extension where extname = 'vector'),
    coalesce((
      select 'schema: ' || n.nspname
      from pg_extension e join pg_namespace n on n.oid = e.extnamespace
      where e.extname = 'vector'
    ), 'not installed')

  -- Tables ------------------------------------------------------------------
  union all
  select 2, 'all 7 tables exist',
    (select count(*) from expected_tables t
      join pg_tables p on p.schemaname = 'compass' and p.tablename = t.tbl) = 7,
    'found ' || (select count(*) from expected_tables t
      join pg_tables p on p.schemaname = 'compass' and p.tablename = t.tbl) || ' of 7'

  union all
  select 3, 'row level security enabled on all 7',
    not exists (
      select 1 from expected_tables t
      join pg_tables p on p.schemaname = 'compass' and p.tablename = t.tbl
      where not p.rowsecurity
    ),
    coalesce((
      select string_agg(p.tablename, ', ')
      from expected_tables t
      join pg_tables p on p.schemaname = 'compass' and p.tablename = t.tbl
      where not p.rowsecurity
    ), 'all enabled')

  -- Policies ----------------------------------------------------------------
  union all
  select 4, 'all 17 expected policies present',
    not exists (
      select 1 from expected_policies e
      where not exists (
        select 1 from pg_policies p
        where p.schemaname = 'compass'
          and p.tablename = e.tbl
          and p.policyname = e.policyname
      )
    ),
    coalesce((
      select string_agg(e.tbl || '.' || e.policyname, ', ')
      from expected_policies e
      where not exists (
        select 1 from pg_policies p
        where p.schemaname = 'compass'
          and p.tablename = e.tbl and p.policyname = e.policyname
      )
    ), 'all present')

  union all
  select 5, 'policy commands match intent',
    not exists (
      select 1 from expected_policies e
      join pg_policies p on p.schemaname = 'compass'
        and p.tablename = e.tbl and p.policyname = e.policyname
      where p.cmd <> e.cmd
    ),
    coalesce((
      select string_agg(e.policyname || ' is ' || p.cmd || ', expected ' || e.cmd, '; ')
      from expected_policies e
      join pg_policies p on p.schemaname = 'compass'
        and p.tablename = e.tbl and p.policyname = e.policyname
      where p.cmd <> e.cmd
    ), 'all match')

  union all
  select 6, 'no unexpected policies in compass',
    not exists (
      select 1 from pg_policies p
      join expected_tables t on t.tbl = p.tablename
      where p.schemaname = 'compass'
        and not exists (
          select 1 from expected_policies e
          where e.tbl = p.tablename and e.policyname = p.policyname
        )
    ),
    coalesce((
      select string_agg(p.tablename || '.' || p.policyname, ', ')
      from pg_policies p
      join expected_tables t on t.tbl = p.tablename
      where p.schemaname = 'compass'
        and not exists (
          select 1 from expected_policies e
          where e.tbl = p.tablename and e.policyname = p.policyname
        )
    ), 'none')

  -- The security-critical negatives ----------------------------------------
  union all
  select 7, 'users has no write policy (service-role only)',
    not exists (
      select 1 from pg_policies
      where schemaname = 'compass' and tablename = 'users' and cmd <> 'SELECT'
    ),
    coalesce((
      select string_agg(policyname || ' (' || cmd || ')', ', ')
      from pg_policies
      where schemaname = 'compass' and tablename = 'users' and cmd <> 'SELECT'
    ), 'read-only, as intended')

  union all
  select 8, 'usage_events has no write policy (rate limit unbypassable)',
    not exists (
      select 1 from pg_policies
      where schemaname = 'compass' and tablename = 'usage_events' and cmd <> 'SELECT'
    ),
    coalesce((
      select string_agg(policyname || ' (' || cmd || ')', ', ')
      from pg_policies
      where schemaname = 'compass' and tablename = 'usage_events' and cmd <> 'SELECT'
    ), 'read-only, as intended')

  union all
  select 9, 'messages has no update policy (append-only transcript)',
    not exists (
      select 1 from pg_policies
      where schemaname = 'compass' and tablename = 'messages' and cmd = 'UPDATE'
    ),
    'append-only'

  union all
  select 10, 'conversation policies reference auth.uid(), not a role check',
    not exists (
      select 1 from pg_policies
      where schemaname = 'compass' and tablename = 'conversations'
        and coalesce(qual, with_check) not like '%uid()%'
    ),
    'per-user, no admin read-through'

  -- Functions ---------------------------------------------------------------
  union all
  select 11, 'auth helper functions exist',
    (select count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'compass'
        and p.proname in ('current_user_role', 'current_user_status',
                          'is_active_member', 'is_active_admin',
                          'set_updated_at', 'handle_new_auth_user')) = 6,
    'found ' || (select count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'compass'
        and p.proname in ('current_user_role', 'current_user_status',
                          'is_active_member', 'is_active_admin',
                          'set_updated_at', 'handle_new_auth_user')) || ' of 6'

  union all
  select 12, 'RLS helpers are security definer',
    not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'compass'
        and p.proname in ('current_user_role', 'current_user_status',
                          'is_active_member', 'is_active_admin',
                          'handle_new_auth_user')
        and not p.prosecdef
    ),
    'all definer'

  union all
  select 13, 'every function pins search_path',
    not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'compass'
        and p.proname in ('current_user_role', 'current_user_status',
                          'is_active_member', 'is_active_admin',
                          'set_updated_at', 'handle_new_auth_user')
        and not exists (
          select 1 from unnest(coalesce(p.proconfig, '{}')) c
          where c like 'search_path=%'
        )
    ),
    'all pinned'

  -- Triggers ----------------------------------------------------------------
  union all
  select 14, 'auth.users mirror trigger installed',
    exists (
      select 1 from pg_trigger
      where tgname = 'compass_on_auth_user_created'
        and tgrelid = 'auth.users'::regclass
        and not tgisinternal
    ),
    'invite flow will populate compass.users'

  union all
  select 15, 'updated_at triggers installed',
    (select count(*) from pg_trigger
      where tgname in ('clients_set_updated_at', 'conversations_set_updated_at')
        and not tgisinternal) = 2,
    'clients + conversations'

  -- Vector column and index -------------------------------------------------
  union all
  select 16, 'document_chunks.embedding is vector(1024)',
    (select format_type(atttypid, atttypmod) from pg_attribute
      where attrelid = 'compass.document_chunks'::regclass
        and attname = 'embedding') like '%vector(1024)',
    coalesce((select format_type(atttypid, atttypmod) from pg_attribute
      where attrelid = 'compass.document_chunks'::regclass
        and attname = 'embedding'), 'column missing')

  union all
  select 17, 'hnsw cosine index on embedding',
    exists (
      select 1 from pg_indexes
      where schemaname = 'compass'
        and indexname = 'document_chunks_embedding_idx'
        and indexdef like '%hnsw%'
        and indexdef like '%vector_cosine_ops%'
    ),
    coalesce((select indexdef from pg_indexes
      where indexname = 'document_chunks_embedding_idx'), 'index missing')

  union all
  select 18, 'lookup indexes present',
    (select count(*) from pg_indexes
      where schemaname = 'compass' and indexname in (
        'users_status_idx', 'clients_name_lower_idx',
        'conversations_user_id_updated_at_idx', 'conversations_client_id_idx',
        'messages_conversation_id_created_at_idx', 'documents_status_idx',
        'document_chunks_document_id_idx', 'usage_events_date_idx')) = 8,
    'found ' || (select count(*) from pg_indexes
      where schemaname = 'compass' and indexname in (
        'users_status_idx', 'clients_name_lower_idx',
        'conversations_user_id_updated_at_idx', 'conversations_client_id_idx',
        'messages_conversation_id_created_at_idx', 'documents_status_idx',
        'document_chunks_document_id_idx', 'usage_events_date_idx')) || ' of 8'

  union all
  select 19, 'usage_events unique on (user_id, date)',
    exists (
      select 1 from pg_constraint
      where conrelid = 'compass.usage_events'::regclass and contype = 'u'
    ),
    'one row per user per UTC day'

  -- Enums -------------------------------------------------------------------
  union all
  -- 9 labels total: user_role 2, user_status 3, message_role 2,
  -- document_status 2. Compared as exact sets, not a count, so a renamed or
  -- extra label fails rather than balancing out.
  select 20, 'enums have exactly the expected labels',
    not exists (
      select 1 from (
        values
          ('user_role',       'admin,consultant'),
          ('user_status',     'active,disabled,invited'),
          ('message_role',    'assistant,user'),
          ('document_status', 'active,deactivated')
      ) as want (typname, labels)
      where want.labels is distinct from (
        select string_agg(e.enumlabel, ',' order by e.enumlabel)
        from pg_type t join pg_enum e on e.enumtypid = t.oid
        where t.typname = want.typname
      )
    ),
    coalesce((
      select string_agg(t.typname || '(' || c.n || ')', ', ' order by t.typname)
      from pg_type t
      join lateral (
        select count(*) as n from pg_enum e where e.enumtypid = t.oid
      ) c on true
      where t.typname in ('user_role', 'user_status', 'message_role',
                          'document_status')
    ), 'no enums found')

  -- Storage -----------------------------------------------------------------
  union all
  select 21, 'documents bucket exists and is PRIVATE',
    exists (select 1 from storage.buckets where id = 'compass-documents' and not public),
    coalesce((select 'public=' || public::text from storage.buckets
      where id = 'compass-documents'), 'bucket missing')

  -- Role scoping ------------------------------------------------------------
  -- Added after a dashboard-created policy granted to {public} was found on
  -- `documents`, silently OR-ing past the admin-only rule. Name and command
  -- checks both passed it, because the flaw was the role. PUBLIC includes
  -- `anon`, and the anon key ships in the browser bundle, so a policy granted
  -- to it is reachable by anyone who loads the app.
  union all
  select 23, 'no policy is granted to public/anon',
    not exists (
      select 1 from pg_policies p
      where (
              (p.schemaname = 'compass'
                and p.tablename in (select tbl from expected_tables))
           or (p.schemaname = 'storage'
                and p.policyname like 'compass_documents_%')
            )
        and p.roles::text[] && array['public', 'anon']
    ),
    coalesce((
      select string_agg(
        p.schemaname || '.' || p.tablename || '.' || p.policyname
          || ' -> ' || p.roles::text, ', ')
      from pg_policies p
      where (
              (p.schemaname = 'compass'
                and p.tablename in (select tbl from expected_tables))
           or (p.schemaname = 'storage'
                and p.policyname like 'compass_documents_%')
            )
        and p.roles::text[] && array['public', 'anon']
    ), 'all scoped to authenticated')

  -- Column shape ------------------------------------------------------------
  -- Added after `create table if not exists public.documents` silently did
  -- nothing, because an unrelated project already owned a table by that name.
  -- Checks 2 and 4 both passed: the table existed and the policies were on it.
  -- Existence is not identity, so assert the actual columns.
  union all
  select 24, 'every table has the expected columns',
    not exists (
      select 1 from (
        values
          ('users','id,email,role,status,created_at,invited_by'),
          ('clients','id,name,industry,size,notes,created_by,created_at,updated_at'),
          ('conversations','id,user_id,client_id,title,created_at,updated_at,pending_client_link'),
          ('messages','id,conversation_id,role,content,source_chunk_ids,created_at'),
          ('documents','id,title,storage_path,uploaded_by,status,uploaded_at'),
          ('document_chunks','id,document_id,content,embedding,chunk_index,created_at'),
          ('usage_events','id,user_id,date,count')
      ) as want (tbl, cols)
      where (
        select string_agg(c.column_name, ',' order by c.column_name)
        from information_schema.columns c
        where c.table_schema = 'compass' and c.table_name = want.tbl
      ) is distinct from (
        select string_agg(x, ',' order by x)
        from unnest(string_to_array(want.cols, ',')) as x
      )
    ),
    coalesce((
      select string_agg(want.tbl, ', ')
      from (
        values
          ('users','id,email,role,status,created_at,invited_by'),
          ('clients','id,name,industry,size,notes,created_by,created_at,updated_at'),
          ('conversations','id,user_id,client_id,title,created_at,updated_at,pending_client_link'),
          ('messages','id,conversation_id,role,content,source_chunk_ids,created_at'),
          ('documents','id,title,storage_path,uploaded_by,status,uploaded_at'),
          ('document_chunks','id,document_id,content,embedding,chunk_index,created_at'),
          ('usage_events','id,user_id,date,count')
      ) as want (tbl, cols)
      where (
        select string_agg(c.column_name, ',' order by c.column_name)
        from information_schema.columns c
        where c.table_schema = 'compass' and c.table_name = want.tbl
      ) is distinct from (
        select string_agg(x, ',' order by x)
        from unnest(string_to_array(want.cols, ',')) as x
      )
    ), 'all tables match the migration')

  union all
  select 22, 'storage policies are admin-only',
    (select count(*) from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname like 'compass_documents_%') = 3,
    'found ' || (select count(*) from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname like 'compass_documents_%') || ' of 3'

  -- Rate limiting -------------------------------------------------------------
  -- The 20/day cap has no meaningful client-side enforcement if this function
  -- is missing, misconfigured as SECURITY INVOKER (which would let it run
  -- under the caller's own, more restricted grants rather than bypass RLS to
  -- write usage_events), or callable by `authenticated`.
  union all
  select 25, 'increment_daily_usage exists and is security definer',
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'compass'
        and p.proname = 'increment_daily_usage'
        and p.prosecdef
    ),
    coalesce((
      select case when p.prosecdef then 'definer' else 'INVOKER (wrong)' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'compass' and p.proname = 'increment_daily_usage'
    ), 'function missing')

  union all
  select 26, 'increment_daily_usage is callable only by service_role',
    (
      has_function_privilege('service_role', 'compass.increment_daily_usage(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'compass.increment_daily_usage(uuid)', 'execute')
      and not has_function_privilege('anon', 'compass.increment_daily_usage(uuid)', 'execute')
    ),
    'service_role=' || has_function_privilege('service_role', 'compass.increment_daily_usage(uuid)', 'execute')::text
      || ', authenticated=' || has_function_privilege('authenticated', 'compass.increment_daily_usage(uuid)', 'execute')::text
      || ', anon=' || has_function_privilege('anon', 'compass.increment_daily_usage(uuid)', 'execute')::text
)

select
  case when ok then 'PASS' else 'FAIL' end as status,
  check_name,
  detail
from checks
order by ok asc, sort_key asc;
