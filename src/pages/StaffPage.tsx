import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users, Pencil, Plus, Search, Trash2, KeyRound, Check, Copy, Camera, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSchool } from '@/providers/SchoolProvider'
import type { Tables } from '@/types/database'
import { uploadStaffPhoto, removeStaffPhoto, STAFF_PHOTOS } from '@/lib/storage'
import { docHeaderHtml, printHtml, tableHtml, type Column } from '@/lib/print'
import { exportSheet } from '@/lib/excel'
import { ExportButtons } from '@/components/ExportButtons'
import { cn, formatDate } from '@/lib/utils'
import { Avatar } from '@/components/StudentAvatar'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { FullScreenLoader } from '@/components/ui/spinner'

type Staff = Tables<'staff'>

interface InviteResult {
  user_id: string
  email: string
  role: string
  created: boolean
  temp_password: string | null
}

async function inviteLogin(schoolId: string, email: string, role: string, fullName: string) {
  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: { school_id: schoolId, email, role, full_name: fullName },
  })
  if (error) {
    let msg = error.message
    try {
      const ctx = (error as { context?: Response }).context
      const body = ctx ? await ctx.json() : null
      if (body?.error) msg = body.error
    } catch {
      /* keep default message */
    }
    throw new Error(msg)
  }
  return data as InviteResult
}

export function StaffPage() {
  const { activeSchool } = useSchool()
  const schoolId = activeSchool?.id
  const qc = useQueryClient()
  const [dialog, setDialog] = useState<{ open: boolean; staff: Staff | null }>({ open: false, staff: null })
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState('')

  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('school_id', schoolId!)
        .order('last_name')
      if (error) throw error
      return data as Staff[]
    },
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('staff').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff', schoolId] }),
  })

  const { data: subjectMap } = useQuery({
    queryKey: ['all_staff_subjects', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase.from('staff_subjects').select('staff_id, subjects(name)').eq('school_id', schoolId!)
      const map = new Map<string, string[]>()
      for (const r of data ?? []) {
        const name = (r.subjects as unknown as { name: string } | null)?.name
        if (!name) continue
        const arr = map.get(r.staff_id as string) ?? []
        arr.push(name)
        map.set(r.staff_id as string, arr)
      }
      return map
    },
  })

  const departments = useMemo(
    () => [...new Set((staff ?? []).map((s) => s.department).filter(Boolean))] as string[],
    [staff],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (staff ?? []).filter((m) => {
      if (q && !`${m.first_name} ${m.last_name} ${m.staff_no ?? ''} ${m.email ?? ''}`.toLowerCase().includes(q)) return false
      if (dept && m.department !== dept) return false
      return true
    })
  }, [staff, search, dept])

  const exportCols: Column[] = [
    { key: 'no', label: 'Staff No.' },
    { key: 'name', label: 'Name' },
    { key: 'qual', label: 'Qualification' },
    { key: 'subjects', label: 'Subjects' },
    { key: 'dept', label: 'Department' },
    { key: 'employed', label: 'Employed' },
    { key: 'contact', label: 'Contact' },
  ]
  const exportRows = () =>
    filtered.map((m) => ({
      no: m.staff_no ?? '—',
      name: `${m.title ? m.title + ' ' : ''}${m.first_name} ${m.last_name}`,
      qual: m.qualification ?? '—',
      subjects: (subjectMap?.get(m.id) ?? []).join(', ') || '—',
      dept: m.department ?? '—',
      employed: m.employment_date ? formatDate(m.employment_date, { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
      contact: m.email ?? m.phone ?? '—',
    }))
  const exportPdf = () => {
    const rows = exportRows()
    const header = docHeaderHtml({
      name: activeSchool?.name ?? 'School',
      address: activeSchool?.address,
      logoUrl: activeSchool?.logo_url,
      title: 'Staff List',
      subtitle: `${rows.length} staff${dept ? ' · ' + dept : ''}`,
    })
    printHtml('Staff List', header + tableHtml(exportCols, rows))
  }
  const exportXlsx = () => exportSheet('Staff List', exportCols, exportRows(), 'Staff', 'Staff List')

  if (isLoading) return <FullScreenLoader />

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Teachers and administrators. Give a staff member login access to the platform."
        action={
          <Button onClick={() => setDialog({ open: true, staff: null })}>
            <Plus className="h-4 w-4" /> Add staff
          </Button>
        }
      />

      {staff && staff.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[190px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input className="pl-9" placeholder="Search name, staff no. or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-auto">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Select>
          <ExportButtons onPdf={exportPdf} onExcel={exportXlsx} />
        </div>
      )}

      <Card>
        {!staff || staff.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No staff yet"
            description="Add teachers and administrators. You can give each of them a login."
            action={
              <Button onClick={() => setDialog({ open: true, staff: null })}>
                <Plus className="h-4 w-4" /> Add your first staff
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-faint">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Department</th>
                  <th className="px-5 py-3 font-medium">Contact</th>
                  <th className="px-5 py-3 font-medium">Login</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">
                      <Link to={`/staff/${m.id}`} className="flex items-center gap-3 hover:text-primary">
                        <Avatar
                          photoPath={m.photo_url}
                          firstName={m.first_name}
                          lastName={m.last_name}
                          size={34}
                          bucket={STAFF_PHOTOS}
                        />
                        <div>
                          <p className="font-medium text-foreground">
                            {m.title ? `${m.title} ` : ''}
                            {m.first_name} {m.last_name}
                          </p>
                          {m.staff_no && <p className="font-mono text-xs text-muted">{m.staff_no}</p>}
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted">{m.department ?? '—'}</td>
                    <td className="px-5 py-3 text-muted">{m.email ?? m.phone ?? '—'}</td>
                    <td className="px-5 py-3">
                      {m.user_id ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                          <KeyRound className="h-3 w-3" /> Active
                        </span>
                      ) : (
                        <span className="text-xs text-faint">No login</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDialog({ open: true, staff: m })}
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Delete ${m.first_name} ${m.last_name}? This cannot be undone.`))
                              del.mutate(m.id)
                          }}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {dialog.open && schoolId && (
        <StaffDialog
          schoolId={schoolId}
          staff={dialog.staff}
          onClose={() => setDialog({ open: false, staff: null })}
          onSaved={() => {
            setDialog({ open: false, staff: null })
            qc.invalidateQueries({ queryKey: ['staff', schoolId] })
          }}
        />
      )}
    </div>
  )
}

export function StaffDialog({
  schoolId,
  staff,
  onClose,
  onSaved,
}: {
  schoolId: string
  staff: Staff | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(staff?.title ?? '')
  const [firstName, setFirstName] = useState(staff?.first_name ?? '')
  const [lastName, setLastName] = useState(staff?.last_name ?? '')
  const [staffNo, setStaffNo] = useState(staff?.staff_no ?? '')
  const [department, setDepartment] = useState(staff?.department ?? '')
  const [qualification, setQualification] = useState(staff?.qualification ?? '')
  const [employmentDate, setEmploymentDate] = useState(staff?.employment_date ?? '')
  const [subjectIds, setSubjectIds] = useState<string[]>([])
  const [phone, setPhone] = useState(staff?.phone ?? '')
  const [email, setEmail] = useState(staff?.email ?? '')

  const { data: allSubjects } = useQuery({
    queryKey: ['subjects', schoolId],
    queryFn: async () => {
      const { data } = await supabase.from('subjects').select('id, name').eq('school_id', schoolId).order('name')
      return (data ?? []) as { id: string; name: string }[]
    },
  })

  const { data: existingSubjectIds } = useQuery({
    queryKey: ['staff_subjects', staff?.id],
    enabled: !!staff?.id,
    queryFn: async () => {
      const { data } = await supabase.from('staff_subjects').select('subject_id').eq('staff_id', staff!.id)
      return (data ?? []).map((r) => r.subject_id as string)
    },
  })
  useEffect(() => {
    if (existingSubjectIds) setSubjectIds(existingSubjectIds)
  }, [existingSubjectIds])

  const toggleSubject = (id: string) =>
    setSubjectIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const [giveLogin, setGiveLogin] = useState(false)
  const [role, setRole] = useState('teacher')
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<InviteResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const localPreview = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile])
  const showExistingPhoto = !!staff?.photo_url && !removePhoto && !photoFile
  const hasLogin = !!staff?.user_id

  const save = useMutation({
    mutationFn: async (): Promise<InviteResult | null> => {
      const payload = {
        title: title.trim() || null,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        department: department.trim() || null,
        qualification: qualification.trim() || null,
        employment_date: employmentDate || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
      }

      let staffId = staff?.id
      if (staff) {
        const { error } = await supabase
          .from('staff')
          .update({ ...payload, staff_no: staffNo.trim() || null })
          .eq('id', staff.id)
        if (error) throw error
      } else {
        // Staff numbers are generated automatically.
        const { data: generated, error: genErr } = await supabase.rpc('next_staff_no', { p_school: schoolId })
        if (genErr) throw genErr
        const { data, error } = await supabase
          .from('staff')
          .insert({ ...payload, staff_no: generated, school_id: schoolId })
          .select('id')
          .single()
        if (error) throw error
        staffId = data.id as string
      }

      if (staffId && photoFile) {
        const path = await uploadStaffPhoto(schoolId, staffId, photoFile)
        await supabase.from('staff').update({ photo_url: path }).eq('id', staffId)
      } else if (staffId && removePhoto && staff?.photo_url) {
        await removeStaffPhoto(`${schoolId}/${staffId}`)
        await supabase.from('staff').update({ photo_url: null }).eq('id', staffId)
      }

      // Sync subjects taught.
      if (staffId) {
        await supabase.from('staff_subjects').delete().eq('staff_id', staffId)
        if (subjectIds.length) {
          const { error } = await supabase
            .from('staff_subjects')
            .insert(subjectIds.map((sid) => ({ school_id: schoolId, staff_id: staffId!, subject_id: sid })))
          if (error) throw error
        }
      }

      if (giveLogin && !hasLogin) {
        if (!email.trim()) throw new Error('An email is required to create a login.')
        const res = await inviteLogin(schoolId, email.trim(), role, `${firstName} ${lastName}`.trim())
        if (staffId) await supabase.from('staff').update({ user_id: res.user_id }).eq('id', staffId)
        return res
      }
      return null
    },
    onSuccess: (res) => {
      if (res?.temp_password) setCredentials(res)
      else onSaved()
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not save staff.'),
  })

  // Credentials result view (after creating a new login).
  if (credentials) {
    return (
      <Dialog
        open
        onClose={onSaved}
        title="Login created"
        footer={<Button onClick={onSaved}>Done</Button>}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Share these details with the staff member. They can change the password after signing in.
            This password won't be shown again.
          </p>
          <div className="rounded-md border border-border bg-muted-surface p-4 text-sm">
            <div className="mb-2">
              <span className="text-xs uppercase tracking-wider text-faint">Email</span>
              <p className="font-mono text-foreground">{credentials.email}</p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-faint">Temporary password</span>
              <p className="font-mono text-foreground">{credentials.temp_password}</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard
                ?.writeText(`Email: ${credentials.email}\nPassword: ${credentials.temp_password}`)
                .then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                })
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy credentials'}
          </Button>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={staff ? 'Edit staff' : 'Add staff'}
      className="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={!firstName.trim() || !lastName.trim()}
          >
            {staff ? 'Save' : 'Add staff'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Photo */}
        <div className="flex items-center gap-4">
          {showExistingPhoto ? (
            <Avatar photoPath={staff!.photo_url} firstName={firstName} lastName={lastName} size={72} bucket={STAFF_PHOTOS} />
          ) : (
            <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full bg-primary/10 text-lg font-medium text-primary">
              {localPreview ? (
                <img src={localPreview} alt="" className="h-full w-full object-cover" />
              ) : (
                `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || <Camera className="h-6 w-6 opacity-40" />
              )}
            </div>
          )}
          <div className="flex flex-col items-start gap-1.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  setPhotoFile(f)
                  setRemovePhoto(false)
                }
              }}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Camera className="h-4 w-4" /> {localPreview || showExistingPhoto ? 'Change' : 'Upload photo'}
              </Button>
              {(localPreview || showExistingPhoto) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPhotoFile(null)
                    setRemovePhoto(true)
                    if (fileRef.current) fileRef.current.value = ''
                  }}
                >
                  <X className="h-4 w-4" /> Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted">Staff photo · JPG, PNG or WebP</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Title" htmlFor="sf-title">
            <Input id="sf-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mr" />
          </Field>
          <Field label="First name" htmlFor="sf-first" className="sm:col-span-1">
            <Input id="sf-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last name" htmlFor="sf-last">
            <Input id="sf-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Staff no." htmlFor="sf-no" hint={staff ? undefined : 'Generated automatically on save.'}>
            <Input
              id="sf-no"
              value={staff ? staffNo : 'Assigned automatically'}
              onChange={(e) => setStaffNo(e.target.value)}
              disabled={!staff}
            />
          </Field>
          <Field label="Department" htmlFor="sf-dept">
            <Input id="sf-dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Sciences" />
          </Field>
        </div>
        <Field label="Qualification" htmlFor="sf-qual" hint="Highest qualification, e.g. B.Ed Mathematics, M.Sc, NCE.">
          <Input id="sf-qual" value={qualification} onChange={(e) => setQualification(e.target.value)} placeholder="B.Ed Mathematics" />
        </Field>

        <Field label="Date of employment" htmlFor="sf-emp">
          <DatePicker value={employmentDate} onChange={setEmploymentDate} maxYear={new Date().getFullYear()} minYear={1920} />
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Subjects taught</p>
          {!allSubjects || allSubjects.length === 0 ? (
            <p className="text-xs text-muted">No subjects yet — add them in the Subjects section.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allSubjects.map((s) => {
                const on = subjectIds.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSubject(s.id)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm transition-colors',
                      on ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-surface text-muted hover:bg-muted-surface',
                    )}
                  >
                    {s.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="sf-phone">
            <Input id="sf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="sf-email">
            <Input id="sf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>

        {hasLogin ? (
          <div className="rounded-md border border-border bg-muted-surface px-4 py-3 text-sm text-muted">
            <span className="inline-flex items-center gap-1 font-medium text-success">
              <KeyRound className="h-4 w-4" /> This staff member already has login access.
            </span>
          </div>
        ) : (
          <div className="rounded-md border border-border p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={giveLogin}
                onChange={(e) => setGiveLogin(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-[var(--primary)]"
              />
              Give this staff member login access
            </label>
            {giveLogin && (
              <div className="mt-3">
                <Field label="Role" htmlFor="sf-role" hint="Creates an account (needs the email above) and returns a temporary password.">
                  <Select id="sf-role" value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Administrator</option>
                    <option value="bursar">Bursar</option>
                  </Select>
                </Field>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}
