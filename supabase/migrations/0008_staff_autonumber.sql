-- =============================================================================
-- Auto staff numbers
-- Migration 0008_staff_autonumber
-- =============================================================================

alter table schools add column if not exists staff_next int not null default 1;

create or replace function public.next_staff_no(p_school uuid)
returns text language plpgsql security definer set search_path = public as $$
declare seq int; pref text; nm text; candidate text;
begin
  select admission_prefix, name into pref, nm from schools where id = p_school;
  if pref is null or pref = '' then
    pref := upper(left(regexp_replace(coalesce(nm, 'SCH'), '[^A-Za-z]', '', 'g'), 3));
  end if;
  loop
    update schools set staff_next = staff_next + 1 where id = p_school returning staff_next - 1 into seq;
    candidate := pref || '/STF/' || lpad(seq::text, 3, '0');
    exit when not exists (select 1 from staff where school_id = p_school and staff_no = candidate);
  end loop;
  return candidate;
end $$;

revoke execute on function public.next_staff_no(uuid) from anon;

update schools s set staff_next = greatest(s.staff_next,
  coalesce((select count(*) + 1 from staff st where st.school_id = s.id), 1));
