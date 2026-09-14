-- =============================================================================
-- Timetable + Assignments (Phase 4)
-- Migration 0005_timetable_assignments
-- =============================================================================

create table timetable_entries (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  class_arm_id  uuid not null references class_arms (id) on delete cascade,
  day_of_week   int not null,   -- 1=Mon … 5=Fri
  period        int not null,   -- 1-based
  start_time    text,
  end_time      text,
  subject_id    uuid references subjects (id) on delete set null,
  staff_id      uuid references staff (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (class_arm_id, day_of_week, period)
);
create index on timetable_entries (school_id);
create index on timetable_entries (class_arm_id);

create table assignments (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  class_arm_id  uuid not null references class_arms (id) on delete cascade,
  subject_id    uuid references subjects (id) on delete set null,
  term_id       uuid references terms (id) on delete set null,
  title         text not null,
  description   text,
  due_date      date,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on assignments (school_id);
create index on assignments (class_arm_id);

create trigger set_updated_at before update on assignments
  for each row execute function public.app_set_updated_at();

alter table timetable_entries enable row level security;
create policy tt_sel on timetable_entries for select using (public.is_member_of(school_id));
create policy tt_ins on timetable_entries for insert with check (public.has_role(school_id, array['owner','admin','teacher']::app_role[]));
create policy tt_upd on timetable_entries for update using (public.has_role(school_id, array['owner','admin','teacher']::app_role[]));
create policy tt_del on timetable_entries for delete using (public.has_role(school_id, array['owner','admin','teacher']::app_role[]));

alter table assignments enable row level security;
create policy asg_sel on assignments for select using (public.is_member_of(school_id));
create policy asg_ins on assignments for insert with check (public.has_role(school_id, array['owner','admin','teacher']::app_role[]));
create policy asg_upd on assignments for update using (public.has_role(school_id, array['owner','admin','teacher']::app_role[]));
create policy asg_del on assignments for delete using (public.has_role(school_id, array['owner','admin','teacher']::app_role[]));
