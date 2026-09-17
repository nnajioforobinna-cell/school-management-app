-- =============================================================================
-- Per-student subject enrolment (electives)
-- Migration 0016_student_subjects
--
-- A student "offers" a subject for a session if they have a row here. A student
-- with NO rows for the session is treated as taking all of their class's
-- subjects — the safe default so JSS (uniform curriculum) needs no setup, while
-- SSS electives can be tuned per student.
-- =============================================================================
create table if not exists public.student_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  session_id uuid not null references public.academic_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, subject_id, session_id)
);

alter table public.student_subjects enable row level security;
create index if not exists student_subjects_school_session_idx on public.student_subjects (school_id, session_id);
create index if not exists student_subjects_student_session_idx on public.student_subjects (student_id, session_id);

create policy student_subjects_sel on public.student_subjects
  for select using (public.is_member_of(school_id));
create policy student_subjects_ins on public.student_subjects
  for insert with check (public.has_role(school_id, array['owner','admin']::app_role[]));
create policy student_subjects_upd on public.student_subjects
  for update using (public.has_role(school_id, array['owner','admin']::app_role[]));
create policy student_subjects_del on public.student_subjects
  for delete using (public.has_role(school_id, array['owner','admin']::app_role[]));
