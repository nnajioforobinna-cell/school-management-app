-- =============================================================================
-- Harden SECURITY DEFINER function grants + guard counter functions
-- Migration 0015_harden_function_grants
--
-- Two issues the security advisor surfaced before the public (Netlify) deploy:
--
-- 1. Earlier revokes (0006/0007/0008) said `revoke ... from anon, authenticated`
--    but Postgres grants EXECUTE to PUBLIC by default, and PUBLIC was never
--    revoked — so anon/authenticated still inherited EXECUTE. We revoke from
--    PUBLIC here (the effective fix) and grant back only where the app needs it.
--
-- 2. next_admission_no / next_staff_no mutate a school's counter but never
--    checked membership, so any signed-in user could bump another school's
--    counter. We add an is_member_of() guard.
--
-- Deliberately left alone:
--   * is_member_of / has_role / is_admin / is_school_admin / is_platform_admin
--     — used inside RLS policies, so `authenticated` MUST retain EXECUTE.
--   * public.submit_census(jsonb) — the Parish Census app's intentionally
--     anon-callable public submission endpoint.
-- =============================================================================

-- 1. Counter functions: guard membership, then lock execute down to signed-in
--    users of the school in question.
create or replace function public.next_admission_no(p_school uuid)
returns text language plpgsql security definer set search_path = public as $$
declare seq int; pref text; nm text; candidate text;
begin
  if not public.is_member_of(p_school) then
    raise exception 'not a member of this school';
  end if;
  select admission_prefix, name into pref, nm from schools where id = p_school;
  if pref is null or pref = '' then
    pref := upper(left(regexp_replace(coalesce(nm, 'SCH'), '[^A-Za-z]', '', 'g'), 3));
  end if;
  loop
    update schools set admission_next = admission_next + 1 where id = p_school returning admission_next - 1 into seq;
    candidate := pref || '/' || to_char(now(), 'YYYY') || '/' || lpad(seq::text, 3, '0');
    exit when not exists (select 1 from students where school_id = p_school and admission_no = candidate);
  end loop;
  return candidate;
end $$;

create or replace function public.next_staff_no(p_school uuid)
returns text language plpgsql security definer set search_path = public as $$
declare seq int; pref text; nm text; candidate text;
begin
  if not public.is_member_of(p_school) then
    raise exception 'not a member of this school';
  end if;
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

revoke execute on function public.next_admission_no(uuid) from public;
revoke execute on function public.next_staff_no(uuid) from public;
grant execute on function public.next_admission_no(uuid) to authenticated;
grant execute on function public.next_staff_no(uuid) to authenticated;

-- 2. Trigger-only functions: never called via RPC, never used in RLS. Revoke
--    from PUBLIC so they're not exposed on /rest/v1/rpc at all.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.on_payment_change() from public;
revoke execute on function public.recompute_invoice(uuid) from public;

-- 3. Keep-alive: invoked by pg_cron (as the job owner), never by the app.
revoke execute on function public.keep_alive_ping() from public;
