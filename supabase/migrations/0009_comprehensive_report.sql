-- -----------------------------------------------------------------------------
-- Phase 2, days 10-11 — the Comprehensive Report.
--
-- CLAUDE.md, "Data model additions": the report itself is a generated
-- artifact, not its own table, since it is fully derived from the
-- Engagement's Departments. The one thing that does need a column is where
-- the generated PDF lives, the same shape as departments.pdf_storage_path.
-- -----------------------------------------------------------------------------

alter table compass.engagements
  add column if not exists report_storage_path text;
