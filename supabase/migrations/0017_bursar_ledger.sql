-- =============================================================================
-- Bursar accounting ledger
-- Migration 0017_bursar_ledger
--
-- Daily income & expense entries plus reusable categories. Fee income for the
-- financial report is computed from payments (per fee structure); this ledger
-- captures everything else (canteen, salaries, maintenance, etc.). Restricted
-- to owner / admin / bursar.
-- =============================================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'ledger_kind') then
    create type public.ledger_kind as enum ('income', 'expense');
  end if;
end $$;

create table if not exists public.ledger_categories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  kind public.ledger_kind not null,
  created_at timestamptz not null default now(),
  unique (school_id, kind, name)
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  date date not null default current_date,
  kind public.ledger_kind not null,
  category_id uuid references public.ledger_categories(id) on delete set null,
  party text,
  description text,
  amount numeric(14,2) not null default 0,
  session_id uuid references public.academic_sessions(id) on delete set null,
  term_id uuid references public.terms(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ledger_entries_school_date_idx on public.ledger_entries (school_id, date);
create index if not exists ledger_entries_school_session_idx on public.ledger_entries (school_id, session_id);

alter table public.ledger_categories enable row level security;
alter table public.ledger_entries enable row level security;

create policy ledger_cat_sel on public.ledger_categories for select
  using (public.has_role(school_id, array['owner','admin','bursar']::app_role[]));
create policy ledger_cat_ins on public.ledger_categories for insert
  with check (public.has_role(school_id, array['owner','admin','bursar']::app_role[]));
create policy ledger_cat_del on public.ledger_categories for delete
  using (public.has_role(school_id, array['owner','admin','bursar']::app_role[]));

create policy ledger_ent_sel on public.ledger_entries for select
  using (public.has_role(school_id, array['owner','admin','bursar']::app_role[]));
create policy ledger_ent_ins on public.ledger_entries for insert
  with check (public.has_role(school_id, array['owner','admin','bursar']::app_role[]));
create policy ledger_ent_upd on public.ledger_entries for update
  using (public.has_role(school_id, array['owner','admin','bursar']::app_role[]));
create policy ledger_ent_del on public.ledger_entries for delete
  using (public.has_role(school_id, array['owner','admin','bursar']::app_role[]));
