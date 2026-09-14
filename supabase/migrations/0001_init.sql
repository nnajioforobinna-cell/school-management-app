-- =============================================================================
-- School Management App — Initial schema + Row-Level Security
-- Migration 0001_init
--
-- Multi-tenant model: every domain table carries `school_id`. RLS is the real
-- tenant boundary. Helper functions are SECURITY DEFINER so that membership
-- checks do not recurse through the policies they are used in.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type app_role as enum ('owner', 'admin', 'bursar', 'teacher', 'parent', 'student');
create type member_status as enum ('active', 'invited', 'suspended');
create type student_status as enum ('active', 'graduated', 'withdrawn', 'suspended');
create type enrollment_status as enum ('active', 'promoted', 'repeated', 'transferred');
create type attendance_status as enum ('present', 'absent', 'late', 'excused');
create type term_name as enum ('first', 'second', 'third');
create type invoice_status as enum ('draft', 'issued', 'part_paid', 'paid', 'void');
create type payment_method as enum ('bank_transfer', 'cash', 'pos', 'online');

-- -----------------------------------------------------------------------------
-- Identity & tenancy
-- -----------------------------------------------------------------------------

-- Mirrors auth.users with app-facing profile data.
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Platform operators (SaaS super-admins). Not tied to any school.
create table platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table schools (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text unique,
  motto               text,
  address             text,
  phone               text,
  email               text,
  website             text,
  logo_url            text,
  primary_color       text default '#1E5A43',
  currency            text not null default 'NGN',
  subscription_status text not null default 'trial',
  settings            jsonb not null default '{}'::jsonb,
  created_by          uuid references auth.users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- A user's role within a given school. A user may belong to several schools.
create table user_school_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  school_id   uuid not null references schools (id) on delete cascade,
  role        app_role not null,
  status      member_status not null default 'active',
  created_at  timestamptz not null default now(),
  unique (user_id, school_id, role)
);
create index on user_school_roles (school_id);
create index on user_school_roles (user_id);

-- -----------------------------------------------------------------------------
-- RLS helper functions (SECURITY DEFINER — bypass RLS to avoid recursion)
-- -----------------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

create or replace function public.is_member_of(p_school uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from user_school_roles
    where user_id = auth.uid() and school_id = p_school and status = 'active'
  ) or public.is_platform_admin();
$$;

create or replace function public.has_role(p_school uuid, p_roles app_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from user_school_roles
    where user_id = auth.uid()
      and school_id = p_school
      and status = 'active'
      and role = any (p_roles)
  ) or public.is_platform_admin();
$$;

-- Admin-tier = owner/admin (full management of a school).
create or replace function public.is_school_admin(p_school uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_role(p_school, array['owner','admin']::app_role[]);
$$;

-- updated_at maintenance (namespaced to avoid clobbering any existing helper).
create or replace function public.app_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Auto-create a profile row when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Academic structure
-- -----------------------------------------------------------------------------
create table academic_sessions (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools (id) on delete cascade,
  name        text not null,                    -- e.g. "2025/2026"
  start_date  date,
  end_date    date,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (school_id, name)
);
create index on academic_sessions (school_id);

create table terms (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools (id) on delete cascade,
  session_id  uuid not null references academic_sessions (id) on delete cascade,
  name        term_name not null,
  start_date  date,
  end_date    date,
  resumption_date date,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (session_id, name)
);
create index on terms (school_id);

create table class_levels (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools (id) on delete cascade,
  name        text not null,                    -- e.g. "JSS1"
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (school_id, name)
);
create index on class_levels (school_id);

create table class_arms (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools (id) on delete cascade,
  class_level_id  uuid not null references class_levels (id) on delete cascade,
  name            text not null,                -- e.g. "A"
  capacity        int,
  class_teacher_id uuid,                         -- references staff(id), set below
  created_at      timestamptz not null default now(),
  unique (class_level_id, name)
);
create index on class_arms (school_id);

create table subjects (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools (id) on delete cascade,
  name        text not null,
  code        text,
  is_core     boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (school_id, name)
);
create index on subjects (school_id);

-- Configurable grading bands, e.g. {"bands":[{"grade":"A","min":75,"max":100,"remark":"Excellent"}]}
create table grading_schemes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools (id) on delete cascade,
  name        text not null,
  bands       jsonb not null default '[]'::jsonb,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on grading_schemes (school_id);

-- -----------------------------------------------------------------------------
-- People
-- -----------------------------------------------------------------------------
create table staff (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references schools (id) on delete cascade,
  user_id            uuid references auth.users (id) on delete set null,
  staff_no           text,
  title              text,
  first_name         text not null,
  last_name          text not null,
  phone              text,
  email              text,
  department         text,
  employment_status  text not null default 'active',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (school_id, staff_no)
);
create index on staff (school_id);

alter table class_arms
  add constraint class_arms_class_teacher_fk
  foreign key (class_teacher_id) references staff (id) on delete set null;

create table students (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  admission_no  text,
  first_name    text not null,
  last_name     text not null,
  middle_name   text,
  dob           date,
  gender        text,
  photo_url     text,
  status        student_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (school_id, admission_no)
);
create index on students (school_id);

-- A student's placement in a class arm for a given session (handles promotion/repeat).
create table enrollments (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  student_id    uuid not null references students (id) on delete cascade,
  class_arm_id  uuid not null references class_arms (id) on delete restrict,
  session_id    uuid not null references academic_sessions (id) on delete cascade,
  status        enrollment_status not null default 'active',
  created_at    timestamptz not null default now(),
  unique (student_id, session_id)
);
create index on enrollments (school_id);
create index on enrollments (class_arm_id, session_id);

create table guardians (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null,
  full_name     text not null,
  phone         text,
  email         text,
  relationship  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on guardians (school_id);

create table student_guardians (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools (id) on delete cascade,
  student_id   uuid not null references students (id) on delete cascade,
  guardian_id  uuid not null references guardians (id) on delete cascade,
  is_primary   boolean not null default false,
  can_pickup   boolean not null default true,
  unique (student_id, guardian_id)
);
create index on student_guardians (school_id);

create table subject_teachers (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  staff_id      uuid not null references staff (id) on delete cascade,
  subject_id    uuid not null references subjects (id) on delete cascade,
  class_arm_id  uuid not null references class_arms (id) on delete cascade,
  session_id    uuid not null references academic_sessions (id) on delete cascade,
  unique (staff_id, subject_id, class_arm_id, session_id)
);
create index on subject_teachers (school_id);

-- -----------------------------------------------------------------------------
-- Daily operations
-- -----------------------------------------------------------------------------
create table attendance (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  enrollment_id uuid not null references enrollments (id) on delete cascade,
  term_id       uuid references terms (id) on delete set null,
  date          date not null,
  status        attendance_status not null default 'present',
  marked_by     uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  unique (enrollment_id, date)
);
create index on attendance (school_id);
create index on attendance (enrollment_id, date);

create table assessments (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  subject_id    uuid not null references subjects (id) on delete cascade,
  class_arm_id  uuid not null references class_arms (id) on delete cascade,
  term_id       uuid not null references terms (id) on delete cascade,
  name          text not null,                  -- e.g. "1st C.A."
  max_score     numeric(6,2) not null default 100,
  weight        numeric(5,2) not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on assessments (school_id);

create table scores (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  assessment_id uuid not null references assessments (id) on delete cascade,
  student_id    uuid not null references students (id) on delete cascade,
  score         numeric(6,2),
  remark        text,
  recorded_by   uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (assessment_id, student_id)
);
create index on scores (school_id);

create table report_cards (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  student_id    uuid not null references students (id) on delete cascade,
  term_id       uuid not null references terms (id) on delete cascade,
  total_score   numeric(8,2),
  average       numeric(6,2),
  position      int,
  overall_grade text,
  class_teacher_comment text,
  principal_comment text,
  data          jsonb not null default '{}'::jsonb,   -- snapshotted subject lines, domains
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (student_id, term_id)
);
create index on report_cards (school_id);

-- -----------------------------------------------------------------------------
-- Money (manual payment recording — no online gateway yet)
-- -----------------------------------------------------------------------------
create table fee_structures (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools (id) on delete cascade,
  class_level_id  uuid references class_levels (id) on delete cascade,
  session_id      uuid references academic_sessions (id) on delete cascade,
  term_id         uuid references terms (id) on delete set null,
  name            text not null,
  amount          numeric(12,2) not null default 0,
  is_recurring    boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on fee_structures (school_id);

create table invoices (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  student_id    uuid not null references students (id) on delete cascade,
  session_id    uuid references academic_sessions (id) on delete set null,
  term_id       uuid references terms (id) on delete set null,
  reference     text,
  total         numeric(12,2) not null default 0,
  amount_paid   numeric(12,2) not null default 0,
  status        invoice_status not null default 'draft',
  due_date      date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on invoices (school_id);

create table invoice_items (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools (id) on delete cascade,
  invoice_id       uuid not null references invoices (id) on delete cascade,
  fee_structure_id uuid references fee_structures (id) on delete set null,
  description      text not null,
  amount           numeric(12,2) not null default 0
);
create index on invoice_items (school_id);

create table payments (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references schools (id) on delete cascade,
  invoice_id        uuid not null references invoices (id) on delete cascade,
  amount            numeric(12,2) not null,
  method            payment_method not null default 'bank_transfer',
  bank_name         text,
  teller_no         text,
  reference         text,
  receipt_image_url text,
  status            text not null default 'confirmed',
  paid_at           timestamptz not null default now(),
  recorded_by       uuid references auth.users (id),
  created_at        timestamptz not null default now()
);
create index on payments (school_id);

-- -----------------------------------------------------------------------------
-- Communication & trust
-- -----------------------------------------------------------------------------
create table announcements (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  title         text not null,
  body          text,
  audience      jsonb not null default '{}'::jsonb,    -- filters: class, role, individuals
  channels      text[] not null default array['in_app']::text[],  -- in_app, sms, whatsapp
  published_at  timestamptz,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now()
);
create index on announcements (school_id);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  body        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on notifications (user_id);

create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid references schools (id) on delete set null,
  actor_id    uuid references auth.users (id),
  action      text not null,
  entity      text,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index on audit_logs (school_id);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','schools','academic_sessions','grading_schemes','staff','students',
    'assessments','scores','report_cards','fee_structures','invoices'
  ] loop
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function public.app_set_updated_at();', t
    );
  end loop;
end $$;

-- =============================================================================
-- Row-Level Security
-- =============================================================================
-- Standard pattern per tenant table:
--   SELECT  -> is_member_of(school_id)
--   WRITE   -> is_school_admin(school_id)   (teachers additionally on ops tables)
-- =============================================================================

-- profiles: a user sees their own profile and the profiles of co-members.
alter table profiles enable row level security;
create policy profiles_select_self on profiles for select using (id = auth.uid());
create policy profiles_select_comembers on profiles for select using (
  exists (
    select 1 from user_school_roles me
    join user_school_roles them on them.school_id = me.school_id
    where me.user_id = auth.uid() and me.status = 'active' and them.user_id = profiles.id
  ) or public.is_platform_admin()
);
create policy profiles_update_self on profiles for update using (id = auth.uid());

-- platform_admins: only platform admins can read; no self-serve writes.
alter table platform_admins enable row level security;
create policy platform_admins_select on platform_admins for select using (public.is_platform_admin());

-- schools
alter table schools enable row level security;
-- Creator can read the row back immediately after insert (before their owner-role
-- row exists), which keeps onboarding's INSERT ... RETURNING from being blocked.
create policy schools_select on schools for select
  using (public.is_member_of(id) or created_by = auth.uid());
-- Any authenticated user can create a school (they become its owner in app logic).
create policy schools_insert on schools for insert with check (auth.uid() is not null);
create policy schools_update on schools for update using (public.is_school_admin(id));
create policy schools_delete on schools for delete using (public.has_role(id, array['owner']::app_role[]));

-- user_school_roles
alter table user_school_roles enable row level security;
create policy usr_select on user_school_roles for select using (
  user_id = auth.uid() or public.is_school_admin(school_id)
);
-- Bootstrapping: a user may grant themselves OWNER on a school that has no members yet
-- (i.e. the school they just created). Admins may add any member afterwards.
create policy usr_insert on user_school_roles for insert with check (
  public.is_school_admin(school_id)
  or (
    user_id = auth.uid() and role = 'owner'
    and not exists (select 1 from user_school_roles x where x.school_id = user_school_roles.school_id)
  )
);
create policy usr_update on user_school_roles for update using (public.is_school_admin(school_id));
create policy usr_delete on user_school_roles for delete using (public.is_school_admin(school_id));

-- -- Generic tenant tables: SELECT for members, WRITE for school admins.
do $$
declare t text;
begin
  foreach t in array array[
    'academic_sessions','terms','class_levels','class_arms','subjects','grading_schemes',
    'staff','students','enrollments','guardians','student_guardians','subject_teachers',
    'assessments','report_cards','fee_structures','invoices','invoice_items','payments',
    'announcements'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('create policy %I on %I for select using (public.is_member_of(school_id));', t||'_sel', t);
    execute format('create policy %I on %I for insert with check (public.is_school_admin(school_id));', t||'_ins', t);
    execute format('create policy %I on %I for update using (public.is_school_admin(school_id));', t||'_upd', t);
    execute format('create policy %I on %I for delete using (public.is_school_admin(school_id));', t||'_del', t);
  end loop;
end $$;

-- Operational tables where teachers may also write (attendance, scores).
alter table attendance enable row level security;
create policy attendance_sel on attendance for select using (public.is_member_of(school_id));
create policy attendance_write_ins on attendance for insert
  with check (public.has_role(school_id, array['owner','admin','teacher']::app_role[]));
create policy attendance_write_upd on attendance for update
  using (public.has_role(school_id, array['owner','admin','teacher']::app_role[]));
create policy attendance_write_del on attendance for delete
  using (public.is_school_admin(school_id));

alter table scores enable row level security;
create policy scores_sel on scores for select using (public.is_member_of(school_id));
create policy scores_write_ins on scores for insert
  with check (public.has_role(school_id, array['owner','admin','teacher']::app_role[]));
create policy scores_write_upd on scores for update
  using (public.has_role(school_id, array['owner','admin','teacher']::app_role[]));
create policy scores_write_del on scores for delete
  using (public.is_school_admin(school_id));

-- Notifications: a user reads and updates (mark-read) only their own.
alter table notifications enable row level security;
create policy notif_sel on notifications for select using (user_id = auth.uid());
create policy notif_upd on notifications for update using (user_id = auth.uid());
create policy notif_ins on notifications for insert with check (public.is_member_of(school_id));

-- Audit logs: readable by school admins; inserts happen via service role / triggers.
alter table audit_logs enable row level security;
create policy audit_sel on audit_logs for select using (public.is_school_admin(school_id));

-- =============================================================================
-- Notes
-- =============================================================================
-- * Parents/students read access is currently tenant-wide via is_member_of.
--   Phase 2/3 will tighten parent/student SELECT to "their own children / self"
--   with dedicated policies once those dashboards are built.
-- * Granular per-permission RBAC (roles/permissions tables) can layer on top of
--   these role checks later without schema changes to domain tables.
