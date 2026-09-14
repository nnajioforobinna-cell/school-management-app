-- =============================================================================
-- Allow teachers to create/update assessments (for gradebook score entry)
-- Migration 0003_assessments_teacher_write
-- =============================================================================

drop policy if exists assessments_ins on assessments;
drop policy if exists assessments_upd on assessments;

create policy assessments_ins on assessments for insert
  with check (public.has_role(school_id, array['owner', 'admin', 'teacher']::app_role[]));

create policy assessments_upd on assessments for update
  using (public.has_role(school_id, array['owner', 'admin', 'teacher']::app_role[]));
