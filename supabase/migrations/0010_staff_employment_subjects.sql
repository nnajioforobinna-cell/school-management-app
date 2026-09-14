-- =============================================================================
-- Staff employment date + subjects taught
-- Migration 0010_staff_employment_subjects
-- =============================================================================

alter table staff add column if not exists employment_date date;

create table if not exists staff_subjects (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools (id) on delete cascade,
  staff_id    uuid not null references staff (id) on delete cascade,
  subject_id  uuid not null references subjects (id) on delete cascade,
  unique (staff_id, subject_id)
);
create index if not exists staff_subjects_school_idx on staff_subjects (school_id);
create index if not exists staff_subjects_staff_idx on staff_subjects (staff_id);

alter table staff_subjects enable row level security;
create policy ss_sel on staff_subjects for select using (public.is_member_of(school_id));
create policy ss_ins on staff_subjects for insert with check (public.is_school_admin(school_id));
create policy ss_upd on staff_subjects for update using (public.is_school_admin(school_id));
create policy ss_del on staff_subjects for delete using (public.is_school_admin(school_id));
