-- Compass — similarity search over the ingested knowledge base.
--
-- Safe to re-run.

-- pgvector's schema varies by project age, so both candidates go on the path
-- and the `vector` type in the signature below resolves wherever it lives.
-- Parameter types are resolved at CREATE FUNCTION time, so this matters here.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- match_document_chunks
--
-- Deliberately SECURITY INVOKER, which is the default. Running as the caller
-- means the RLS policy on compass.document_chunks still applies, so a disabled
-- account cannot search the knowledge base even though this is a function
-- rather than a table read. A definer function here would quietly become a way
-- around the policy.
--
-- search_path is pinned to a fixed list rather than the empty string: the `<=>`
-- distance operator lives in the pgvector extension's schema and has to be
-- resolvable. A fixed list is not caller-controlled, so it carries the same
-- guarantee that `set search_path = ''` does elsewhere in these migrations.
-- ---------------------------------------------------------------------------

create or replace function compass.match_document_chunks(
  query_embedding vector(1024),
  match_count integer default 8,
  min_similarity double precision default 0.38
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
    -- Cosine distance to similarity, so a larger number means a closer match
    -- and the threshold below reads the way a person expects.
    (1 - (c.embedding <=> query_embedding))::double precision as similarity
  from compass.document_chunks c
  join compass.documents d on d.id = c.document_id
  where d.status = 'active'
    and c.embedding is not null
    and (1 - (c.embedding <=> query_embedding)) >= min_similarity
  -- Ordered by distance rather than by the derived similarity, so the hnsw
  -- index is actually used.
  order by c.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

grant execute on function
  compass.match_document_chunks(vector, integer, double precision)
to authenticated, service_role;

comment on function compass.match_document_chunks is
  'Top matching active chunks for a query embedding. Runs as the caller, so RLS on document_chunks still applies.';
