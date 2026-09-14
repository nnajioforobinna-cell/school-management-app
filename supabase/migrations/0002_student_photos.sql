-- =============================================================================
-- Student passport photos — private Storage bucket + RLS
-- Migration 0002_student_photos
--
-- Objects are stored at "<school_id>/<student_id>", so the first path segment
-- is the tenant key. Photos are private; the app reads them via signed URLs.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-photos', 'student-photos', false, 5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy "student_photos_select" on storage.objects for select to authenticated
using (
  bucket_id = 'student-photos'
  and public.is_member_of(((storage.foldername(name))[1])::uuid)
);

create policy "student_photos_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'student-photos'
  and public.is_school_admin(((storage.foldername(name))[1])::uuid)
);

create policy "student_photos_update" on storage.objects for update to authenticated
using (
  bucket_id = 'student-photos'
  and public.is_school_admin(((storage.foldername(name))[1])::uuid)
);

create policy "student_photos_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'student-photos'
  and public.is_school_admin(((storage.foldername(name))[1])::uuid)
);
