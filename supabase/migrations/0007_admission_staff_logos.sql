-- =============================================================================
-- Admission auto-numbering, staff photos, school logos (Phase-1 refinements)
-- Migration 0007_admission_staff_logos
-- =============================================================================

alter table schools add column if not exists admission_prefix text;
alter table schools add column if not exists admission_next int not null default 1;
alter table staff add column if not exists photo_url text;

-- Hands out the next admission number in registration order, skipping any that
-- already exist (e.g. manually-entered or seeded numbers).
create or replace function public.next_admission_no(p_school uuid)
returns text language plpgsql security definer set search_path = public as $$
declare seq int; pref text; nm text; candidate text;
begin
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

revoke execute on function public.next_admission_no(uuid) from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-logos', 'school-logos', true, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;
create policy "logos_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'school-logos' and public.is_school_admin(((storage.foldername(name))[1])::uuid));
create policy "logos_update" on storage.objects for update to authenticated
using (bucket_id = 'school-logos' and public.is_school_admin(((storage.foldername(name))[1])::uuid));
create policy "logos_delete" on storage.objects for delete to authenticated
using (bucket_id = 'school-logos' and public.is_school_admin(((storage.foldername(name))[1])::uuid));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-photos', 'staff-photos', false, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
create policy "staff_photos_select" on storage.objects for select to authenticated
using (bucket_id = 'staff-photos' and public.is_member_of(((storage.foldername(name))[1])::uuid));
create policy "staff_photos_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'staff-photos' and public.is_school_admin(((storage.foldername(name))[1])::uuid));
create policy "staff_photos_update" on storage.objects for update to authenticated
using (bucket_id = 'staff-photos' and public.is_school_admin(((storage.foldername(name))[1])::uuid));
create policy "staff_photos_delete" on storage.objects for delete to authenticated
using (bucket_id = 'staff-photos' and public.is_school_admin(((storage.foldername(name))[1])::uuid));
