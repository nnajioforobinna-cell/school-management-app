-- =============================================================================
-- Prefects may record attendance (RLS)
-- Migration 0012_prefect_attendance_access
-- =============================================================================

drop policy if exists attendance_write_ins on attendance;
drop policy if exists attendance_write_upd on attendance;
create policy attendance_write_ins on attendance for insert
  with check (public.has_role(school_id, array['owner','admin','teacher','prefect']::app_role[]));
create policy attendance_write_upd on attendance for update
  using (public.has_role(school_id, array['owner','admin','teacher','prefect']::app_role[]));
