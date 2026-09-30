-- -----------------------------------------------------------------------------
-- Phase 2, days 6-8 — category-filtered retrieval, and the department PDF
-- storage bucket.
-- -----------------------------------------------------------------------------

-- match_document_chunks gains an optional category filter. Dropped and
-- recreated rather than `create or replace`: adding a trailing parameter
-- changes the function's signature, and Postgres would treat a mismatched
-- create-or-replace as a second overload rather than a true replacement.
-- Backward compatible at every existing call site: `categories` defaults to
-- null, which means "every active category", the exact behaviour the main
-- chat and bottleneck identification already depend on (CLAUDE.md: bottleneck
-- identification is grounded "the same way the main chat is", i.e. not
-- category-restricted; only Opportunity Mapping passes categories).
set search_path = public, extensions;

drop function if exists compass.match_document_chunks(vector, integer, double precision);

create function compass.match_document_chunks(
  query_embedding vector(1024),
  match_count integer default 8,
  min_similarity double precision default 0.38,
  categories compass.document_category[] default null
)
returns table (
  id uuid,
  document_id uuid,
  document_title text,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = compass, public, extensions
as $$
  select
    c.id,
    c.document_id,
    d.title as document_title,
    c.content,
    (1 - (c.embedding <=> query_embedding))::double precision as similarity
  from compass.document_chunks c
  join compass.documents d on d.id = c.document_id
  where d.status = 'active'
    and c.embedding is not null
    and (1 - (c.embedding <=> query_embedding)) >= min_similarity
    and (categories is null or d.category = any(categories))
  order by c.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

grant execute on function
  compass.match_document_chunks(vector, integer, double precision, compass.document_category[])
to authenticated, service_role;

comment on function compass.match_document_chunks is
  'Top matching active chunks for a query embedding, optionally restricted to specific document categories. Runs as the caller, so RLS on document_chunks still applies.';

-- ---------------------------------------------------------------------------
-- compass-reports — the generated department and Comprehensive Report PDFs.
--
-- Same access shape as engagements/departments themselves (migration 0007):
-- shared read for any active member, since these are real client
-- deliverables an admin needs oversight on, write restricted to whoever may
-- write the underlying department (the assigned consultant, or an admin) via
-- the same exists-through-engagement check, delete admin-only. Private
-- bucket, same as compass-documents: nothing here is served by public URL.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('compass-reports', 'compass-reports', false)
on conflict (id) do update set public = false;

drop policy if exists compass_reports_read_active_members on storage.objects;
create policy compass_reports_read_active_members
  on storage.objects for select to authenticated
  using (bucket_id = 'compass-reports' and compass.is_active_member());

drop policy if exists compass_reports_write_own_engagement_or_admin on storage.objects;
create policy compass_reports_write_own_engagement_or_admin
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'compass-reports'
    and compass.is_active_member()
    and (
      compass.is_active_admin()
      or exists (
        select 1 from compass.engagements e
        where e.consultant_id = (select auth.uid())
          -- storage object names are namespaced "<engagement_id>/...", the
          -- same convention compass-documents uses for uploaded_at prefixes.
          and (storage.foldername(name))[1] = e.id::text
      )
    )
  );

drop policy if exists compass_reports_delete_admin on storage.objects;
create policy compass_reports_delete_admin
  on storage.objects for delete to authenticated
  using (bucket_id = 'compass-reports' and compass.is_active_admin());
