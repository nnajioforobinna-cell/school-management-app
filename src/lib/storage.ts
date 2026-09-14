import { supabase } from '@/lib/supabase'

export const STUDENT_PHOTOS = 'student-photos'

/** Storage path for a student's photo: "<schoolId>/<studentId>". */
export function studentPhotoPath(schoolId: string, studentId: string) {
  return `${schoolId}/${studentId}`
}

/** Upload (or replace) a student's passport photo. Returns the stored path. */
export async function uploadStudentPhoto(schoolId: string, studentId: string, file: File) {
  const path = studentPhotoPath(schoolId, studentId)
  const { error } = await supabase.storage
    .from(STUDENT_PHOTOS)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  return path
}

/** Remove a student's photo from storage (ignores "not found"). */
export async function removeStudentPhoto(path: string) {
  await supabase.storage.from(STUDENT_PHOTOS).remove([path])
}

/** Create a short-lived signed URL for a private photo path. */
export async function signedPhotoUrl(path: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(STUDENT_PHOTOS).createSignedUrl(path, expiresIn)
  if (error) throw error
  return data.signedUrl
}

export const STAFF_PHOTOS = 'staff-photos'
export const SCHOOL_LOGOS = 'school-logos'

/** Generic signed URL for any private bucket. */
export async function signedUrlFor(bucket: string, path: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error) throw error
  return data.signedUrl
}

/** Upload (or replace) a staff member's photo. Returns the stored path. */
export async function uploadStaffPhoto(schoolId: string, staffId: string, file: File) {
  const path = `${schoolId}/${staffId}`
  const { error } = await supabase.storage.from(STAFF_PHOTOS).upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  return path
}

export async function removeStaffPhoto(path: string) {
  await supabase.storage.from(STAFF_PHOTOS).remove([path])
}

/** Upload a school logo to the public bucket and return its public URL. */
export async function uploadSchoolLogo(schoolId: string, file: File) {
  const path = `${schoolId}/logo`
  const { error } = await supabase.storage.from(SCHOOL_LOGOS).upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  const { data } = supabase.storage.from(SCHOOL_LOGOS).getPublicUrl(path)
  // Cache-bust so a replaced logo refreshes immediately.
  return `${data.publicUrl}?v=${Date.now()}`
}

export const PAYMENT_RECEIPTS = 'payment-receipts'

/** Upload a bank-payment receipt image/PDF. Returns the stored path. */
export async function uploadReceipt(schoolId: string, paymentId: string, file: File) {
  const path = `${schoolId}/${paymentId}`
  const { error } = await supabase.storage
    .from(PAYMENT_RECEIPTS)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  return path
}

/** Short-lived signed URL for a private receipt path. */
export async function signedReceiptUrl(path: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(PAYMENT_RECEIPTS).createSignedUrl(path, expiresIn)
  if (error) throw error
  return data.signedUrl
}
