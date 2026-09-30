-- -----------------------------------------------------------------------------
-- Archiving an immersion day (soft delete), admin-only.
--
-- "Delete" in the product is never a real DELETE on an Engagement: it sets
-- archived_at instead, so the record, and the real client-facing PDFs it
-- produced, stays recoverable and still answerable from in chat, just out of
-- the everyday lists. The existing engagements_delete_admin policy (migration
-- 0007) is left in place for genuine hard deletion directly against the
-- database if that's ever actually wanted; the product's own "Delete" action
-- goes through archived_at.
-- -----------------------------------------------------------------------------

alter table compass.engagements
  add column if not exists archived_at timestamptz;

create index if not exists engagements_archived_at_idx
  on compass.engagements (archived_at);

-- Archiving/restoring is admin-only, even though the general update policy
-- (migration 0007) lets the assigned consultant update other engagement
-- fields. RLS's USING/WITH CHECK cannot cleanly compare old vs. new columns
-- in one expression, so this is a trigger, the same mechanism already used
-- for set_updated_at: it fires before every update and rejects the write
-- outright if archived_at is changing and the caller is not an active admin.
-- Defense in depth alongside the requireActiveAdmin() guard in the server
-- actions that call this, the same relationship guards.ts already documents
-- between app guards and RLS for everything else in this app.
create or replace function compass.enforce_archive_admin_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.archived_at is distinct from old.archived_at and not compass.is_active_admin() then
    raise exception 'Only an admin can archive or restore an immersion day.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists engagements_enforce_archive_admin_only on compass.engagements;
create trigger engagements_enforce_archive_admin_only
  before update on compass.engagements
  for each row execute function compass.enforce_archive_admin_only();

-- An archived Engagement is meant to be frozen, not just hidden from the
-- everyday list: the engagement detail page already renders it read-only and
-- hides every mutating form, but that is a UI courtesy, not the control.
-- Without this, a consultant (or a stray bug) could still call
-- extractDepartmentWorkflow or any other pipeline action directly against a
-- department whose Engagement is archived, since the departments RLS update
-- policy (migration 0007) has no idea about archived_at at all. Blocks
-- inserts and updates unconditionally, admins included: the canonical way to
-- edit an archived engagement's departments again is to restore it first, the
-- same "restore, then act" shape the UI already leads an admin through.
create or replace function compass.enforce_department_engagement_not_archived()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from compass.engagements e
    where e.id = new.engagement_id and e.archived_at is not null
  ) then
    raise exception 'This immersion day is archived. Restore it before editing a department.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists departments_enforce_engagement_not_archived on compass.departments;
create trigger departments_enforce_engagement_not_archived
  before insert or update on compass.departments
  for each row execute function compass.enforce_department_engagement_not_archived();
