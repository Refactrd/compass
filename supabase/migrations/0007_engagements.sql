-- -----------------------------------------------------------------------------
-- Phase 2, day 1 — Engagement and Department, plus Document.category.
--
-- An Engagement is one immersion day at one Client's organization. A
-- Department belongs to an Engagement and carries the full per-department
-- pipeline state (transcript through both diagrams, bottlenecks, the
-- Opportunity Mapping, and the generated PDF), populated incrementally as
-- the consultant works through it live onsite. See CLAUDE.md, "Phase 2 —
-- Immersion Day capability".
-- -----------------------------------------------------------------------------

do $$ begin
  create type compass.engagement_status as enum ('in_progress', 'complete');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Same two states as Engagement. "complete" is what the consultant's
  -- "continue to another department or finish" choice sets once a
  -- department's PDF has been generated.
  create type compass.department_status as enum ('in_progress', 'complete');
exception when duplicate_object then null; end $$;

do $$ begin
  create type compass.document_category as enum (
    'tools', 'stack', 'constraints', 'engineering-docs', 'general'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- engagements
-- ---------------------------------------------------------------------------

create table if not exists compass.engagements (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references compass.clients (id) on delete restrict,
  -- Nullable and set null on delete, not cascade: this is the historical
  -- record of a real, client-facing deliverable, and outlives the Compass
  -- account of whichever consultant ran the session, unlike a chat
  -- Conversation, which is personal working history and does not need to.
  consultant_id uuid references compass.users (id) on delete set null,
  date          date not null default current_date,
  status        compass.engagement_status not null default 'in_progress',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists engagements_client_id_idx on compass.engagements (client_id);
create index if not exists engagements_consultant_id_idx on compass.engagements (consultant_id);

alter table compass.engagements enable row level security;

drop trigger if exists engagements_set_updated_at on compass.engagements;
create trigger engagements_set_updated_at
  before update on compass.engagements
  for each row execute function compass.set_updated_at();

-- Visibility follows Client (shared across every active member), not
-- Conversation (strictly per-user): an Engagement is real client-relationship
-- work product, and CLAUDE.md is explicit that output quality here gets admin
-- scrutiny ("treat output quality and correctness here as doing sales work"),
-- which requires admins to be able to see it regardless of who ran the
-- session. Writes are narrower than reads: the assigned consultant or an
-- admin, not any consultant. Delete is admin-only, same reasoning as
-- clients_delete_admin — removing engagement history should be a deliberate
-- admin action.
drop policy if exists engagements_select_active_members on compass.engagements;
create policy engagements_select_active_members
  on compass.engagements for select to authenticated
  using (compass.is_active_member());

drop policy if exists engagements_insert_own_or_admin on compass.engagements;
create policy engagements_insert_own_or_admin
  on compass.engagements for insert to authenticated
  with check (
    ((select auth.uid()) = consultant_id or compass.is_active_admin())
    and compass.is_active_member()
  );

drop policy if exists engagements_update_own_or_admin on compass.engagements;
create policy engagements_update_own_or_admin
  on compass.engagements for update to authenticated
  using (
    ((select auth.uid()) = consultant_id or compass.is_active_admin())
    and compass.is_active_member()
  )
  with check (
    ((select auth.uid()) = consultant_id or compass.is_active_admin())
    and compass.is_active_member()
  );

drop policy if exists engagements_delete_admin on compass.engagements;
create policy engagements_delete_admin
  on compass.engagements for delete to authenticated
  using (compass.is_active_admin());

-- ---------------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------------

create table if not exists compass.departments (
  id                  uuid primary key default gen_random_uuid(),
  engagement_id       uuid not null references compass.engagements (id) on delete cascade,
  name                text not null,
  transcript          text,
  -- Structured step-and-branch schema (lib/immersion/diagram-schema.ts),
  -- rendered by the one fixed template component, never a generic
  -- graph-layout library (CLAUDE.md non-negotiable for this phase).
  before_diagram      jsonb,
  bottlenecks         jsonb,
  -- Tiered solutions with rationale and time-saved estimates. The "after"
  -- diagram is its own column below, a sibling of before_diagram using the
  -- same schema, rather than nested in here, since both diagrams render
  -- through the identical template.
  opportunity_mapping jsonb,
  after_diagram       jsonb,
  pdf_storage_path    text,
  status              compass.department_status not null default 'in_progress',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists departments_engagement_id_idx on compass.departments (engagement_id);

alter table compass.departments enable row level security;

drop trigger if exists departments_set_updated_at on compass.departments;
create trigger departments_set_updated_at
  before update on compass.departments
  for each row execute function compass.set_updated_at();

-- Same shape as engagements: shared read, owner-or-admin write, admin-only
-- delete, joined through the parent engagement since department itself
-- carries no consultant_id.
drop policy if exists departments_select_active_members on compass.departments;
create policy departments_select_active_members
  on compass.departments for select to authenticated
  using (compass.is_active_member());

drop policy if exists departments_insert_own_engagement_or_admin on compass.departments;
create policy departments_insert_own_engagement_or_admin
  on compass.departments for insert to authenticated
  with check (
    compass.is_active_member()
    and exists (
      select 1 from compass.engagements e
      where e.id = engagement_id
        and (e.consultant_id = (select auth.uid()) or compass.is_active_admin())
    )
  );

drop policy if exists departments_update_own_engagement_or_admin on compass.departments;
create policy departments_update_own_engagement_or_admin
  on compass.departments for update to authenticated
  using (
    compass.is_active_member()
    and exists (
      select 1 from compass.engagements e
      where e.id = engagement_id
        and (e.consultant_id = (select auth.uid()) or compass.is_active_admin())
    )
  )
  with check (
    compass.is_active_member()
    and exists (
      select 1 from compass.engagements e
      where e.id = engagement_id
        and (e.consultant_id = (select auth.uid()) or compass.is_active_admin())
    )
  );

drop policy if exists departments_delete_admin on compass.departments;
create policy departments_delete_admin
  on compass.departments for delete to authenticated
  using (compass.is_active_admin());

-- ---------------------------------------------------------------------------
-- documents.category
-- ---------------------------------------------------------------------------

alter table compass.documents
  add column if not exists category compass.document_category not null default 'general';

create index if not exists documents_category_idx on compass.documents (category);
