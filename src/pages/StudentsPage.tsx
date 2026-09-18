import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, GraduationCap, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSchool } from '@/providers/SchoolProvider'
import type { Tables } from '@/types/database'
import { uploadStudentPhoto, removeStudentPhoto, studentPhotoPath } from '@/lib/storage'
import { docHeaderHtml, printHtml, tableHtml, type Column } from '@/lib/print'
import { exportSheet } from '@/lib/excel'
import { ExportButtons } from '@/components/ExportButtons'
import { PageHeader } from '@/components/PageHeader'
import { StudentAvatar } from '@/components/StudentAvatar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { FullScreenLoader } from '@/components/ui/spinner'

type Student = Tables<'students'>

export interface ClassOption {
  id: string
  label: string
  sort: number
}

export function StudentsPage() {
  const { activeSchool, activeRole } = useSchool()
  const schoolId = activeSchool?.id
  const qc = useQueryClient()
  const canManage = activeRole === 'owner' || activeRole === 'admin'
  const [dialog, setDialog] = useState<{ open: boolean; student: Student | null }>({
    open: false,
    student: null,
  })
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [genderFilter, setGenderFilter] = useState('')

  const { data: currentSession } = useQuery({
    queryKey: ['current_session', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academic_sessions')
        .select('*')
        .eq('school_id', schoolId!)
        .eq('is_current', true)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const { data: students, isLoading } = useQuery({
    queryKey: ['students', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('school_id', schoolId!)
        .order('last_name')
        .order('first_name')
      if (error) throw error
      return data as Student[]
    },
  })

  // Class options for the enrolment select (e.g. "JSS1 A").
  const { data: classOptions } = useQuery({
    queryKey: ['class_options', schoolId],
    enabled: !!schoolId,
    queryFn: async (): Promise<ClassOption[]> => {
      const { data, error } = await supabase
        .from('class_arms')
        .select('id, name, class_levels(name, sort_order)')
        .eq('school_id', schoolId!)
      if (error) throw error
      return (data ?? [])
        .map((a) => {
          const level = a.class_levels as unknown as { name: string; sort_order: number } | null
          return {
            id: a.id as string,
            label: `${level?.name ?? '—'} ${a.name}`,
            sort: (level?.sort_order ?? 0) * 100,
          }
        })
        .sort((x, y) => x.label.localeCompare(y.label))
    },
  })

  // Current-session enrolment per student -> class label.
  const { data: enrolments } = useQuery({
    queryKey: ['enrolments', schoolId, currentSession?.id],
    enabled: !!schoolId && !!currentSession,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select('student_id, class_arm_id, class_arms(name, class_levels(name))')
        .eq('school_id', schoolId!)
        .eq('session_id', currentSession!.id)
      if (error) throw error
      const map = new Map<string, { armId: string; label: string }>()
      for (const row of data ?? []) {
        const arm = row.class_arms as unknown as { name: string; class_levels: { name: string } | null } | null
        map.set(row.student_id as string, {
          armId: row.class_arm_id as string,
          label: arm ? `${arm.class_levels?.name ?? ''} ${arm.name}`.trim() : '',
        })
      }
      return map
    },
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('students').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['students', schoolId] }),
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (students ?? []).filter((s) => {
      if (q && !`${s.first_name} ${s.last_name} ${s.admission_no ?? ''}`.toLowerCase().includes(q)) return false
      if (genderFilter && s.gender !== genderFilter) return false
      if (classFilter && enrolments?.get(s.id)?.armId !== classFilter) return false
      return true
    })
  }, [students, search, genderFilter, classFilter, enrolments])

  const exportCols: Column[] = [
    { key: 'adm', label: 'Admission No.' },
    { key: 'name', label: 'Name' },
    { key: 'klass', label: 'Class' },
    { key: 'gender', label: 'Gender' },
    { key: 'status', label: 'Status' },
  ]
  const exportRows = () =>
    filtered.map((s) => ({
      adm: s.admission_no ?? '—',
      name: `${s.last_name}, ${s.first_name}${s.middle_name ? ' ' + s.middle_name : ''}`,
      klass: enrolments?.get(s.id)?.label || '—',
      gender: s.gender ?? '—',
      status: s.status,
    }))
  const exportPdf = () => {
    const rows = exportRows()
    const bits = [
      `${rows.length} student(s)`,
      classFilter ? classOptions?.find((c) => c.id === classFilter)?.label : '',
      genderFilter,
    ].filter(Boolean)
    const header = docHeaderHtml({
      name: activeSchool?.name ?? 'School',
      address: activeSchool?.address,
      logoUrl: activeSchool?.logo_url,
      title: 'Students List',
      subtitle: bits.join(' · '),
    })
    printHtml('Students List', header + tableHtml(exportCols, rows))
  }
  const exportXlsx = () => exportSheet('Students List', exportCols, exportRows(), 'Students', 'Students List')

  if (isLoading) return <FullScreenLoader />

  return (
    <div>
      <PageHeader
        title="Students"
        description="Enrol and manage students. Each student is placed in a class for the current session."
        action={
          canManage ? (
            <Button onClick={() => setDialog({ open: true, student: null })}>
              <Plus className="h-4 w-4" /> Add student
            </Button>
          ) : undefined
        }
      />

      {!currentSession && (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          No current session is set. Add one in <span className="font-medium">Settings → Academics</span> to
          enrol students into a class.
        </div>
      )}

      {students && students.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[190px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              className="pl-9"
              placeholder="Search name or admission no."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="w-auto">
            <option value="">All classes</option>
            {(classOptions ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
          <Select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} className="w-auto">
            <option value="">All genders</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </Select>
          <ExportButtons onPdf={exportPdf} onExcel={exportXlsx} />
        </div>
      )}

      <Card>
        {!students || students.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No students yet"
            description="Add your first student. You can place them in a class straight away."
            action={
              canManage ? (
                <Button onClick={() => setDialog({ open: true, student: null })}>
                  <Plus className="h-4 w-4" /> Add your first student
                </Button>
              ) : undefined
            }
          />
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted">No students match "{search}".</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-faint">
                  <th className="px-5 py-3 font-medium">Admission&nbsp;no.</th>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Class</th>
                  <th className="px-5 py-3 font-medium">Gender</th>
                  {canManage && <th className="px-5 py-3" />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-mono text-xs text-muted">{s.admission_no ?? '—'}</td>
                    <td className="px-5 py-3">
                      <Link
                        to={`/students/${s.id}`}
                        className="flex items-center gap-3 font-medium text-foreground hover:text-primary"
                      >
                        <StudentAvatar
                          photoPath={s.photo_url}
                          firstName={s.first_name}
                          lastName={s.last_name}
                          size={34}
                        />
                        <span>
                          {s.last_name}, {s.first_name}
                          {s.middle_name ? ` ${s.middle_name}` : ''}
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted">{enrolments?.get(s.id)?.label || '—'}</td>
                    <td className="px-5 py-3 text-muted">{s.gender ?? '—'}</td>
                    {canManage && (
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDialog({ open: true, student: s })}
                            aria-label="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Delete ${s.first_name} ${s.last_name}? This cannot be undone.`))
                                del.mutate(s.id)
                            }}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-danger" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {dialog.open && schoolId && (
        <StudentDialog
          schoolId={schoolId}
          student={dialog.student}
          sessionId={currentSession?.id ?? null}
          currentArmId={dialog.student ? (enrolments?.get(dialog.student.id)?.armId ?? null) : null}
          classOptions={classOptions ?? []}
          onClose={() => setDialog({ open: false, student: null })}
          onSaved={() => {
            setDialog({ open: false, student: null })
            qc.invalidateQueries({ queryKey: ['students', schoolId] })
            qc.invalidateQueries({ queryKey: ['enrolments', schoolId] })
          }}
        />
      )}
    </div>
  )
}

export function StudentDialog({
  schoolId,
  student,
  sessionId,
  currentArmId,
  classOptions,
  onClose,
  onSaved,
}: {
  schoolId: string
  student: Student | null
  sessionId: string | null
  currentArmId: string | null
  classOptions: ClassOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const [firstName, setFirstName] = useState(student?.first_name ?? '')
  const [lastName, setLastName] = useState(student?.last_name ?? '')
  const [middleName, setMiddleName] = useState(student?.middle_name ?? '')
  const [admissionNo, setAdmissionNo] = useState(student?.admission_no ?? '')
  const [gender, setGender] = useState(student?.gender ?? '')
  const [dob, setDob] = useState(student?.dob ?? '')
  const [armId, setArmId] = useState(currentArmId ?? '')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const localPreview = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile])
  const showExistingPhoto = !!student?.photo_url && !removePhoto && !photoFile

  const dqc = useQueryClient()
  const [addingClass, setAddingClass] = useState(false)
  const [newLevel, setNewLevel] = useState('')
  const [newArm, setNewArm] = useState('')

  const createClass = useMutation({
    mutationFn: async () => {
      const { data: existing } = await supabase
        .from('class_levels')
        .select('id')
        .eq('school_id', schoolId)
        .eq('name', newLevel.trim())
        .maybeSingle()
      let levelId = existing?.id as string | undefined
      if (!levelId) {
        const { data: lvl, error } = await supabase
          .from('class_levels')
          .insert({ school_id: schoolId, name: newLevel.trim() })
          .select('id')
          .single()
        if (error) throw error
        levelId = lvl.id as string
      }
      const { data: arm, error: aErr } = await supabase
        .from('class_arms')
        .insert({ school_id: schoolId, class_level_id: levelId, name: newArm.trim() })
        .select('id')
        .single()
      if (aErr) throw aErr
      return arm.id as string
    },
    onSuccess: (newArmId) => {
      dqc.invalidateQueries({ queryKey: ['class_options', schoolId] })
      dqc.invalidateQueries({ queryKey: ['class_arms', schoolId] })
      setArmId(newArmId)
      setAddingClass(false)
      setNewLevel('')
      setNewArm('')
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not add class.'),
  })

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        middle_name: middleName.trim() || null,
        gender: gender || null,
        dob: dob || null,
      }

      let studentId = student?.id
      if (student) {
        const { error } = await supabase
          .from('students')
          .update({ ...payload, admission_no: admissionNo.trim() || null })
          .eq('id', student.id)
        if (error) throw error
      } else {
        // Admission numbers are generated automatically in registration order.
        const { data: generated, error: genErr } = await supabase.rpc('next_admission_no', { p_school: schoolId })
        if (genErr) throw genErr
        const { data, error } = await supabase
          .from('students')
          .insert({ ...payload, admission_no: generated, school_id: schoolId })
          .select('id')
          .single()
        if (error) throw error
        studentId = data.id as string
      }

      // Passport photo: upload new, or remove existing.
      if (studentId && photoFile) {
        const path = await uploadStudentPhoto(schoolId, studentId, photoFile)
        const { error } = await supabase.from('students').update({ photo_url: path }).eq('id', studentId)
        if (error) throw error
      } else if (studentId && removePhoto && student?.photo_url) {
        await removeStudentPhoto(studentPhotoPath(schoolId, studentId))
        const { error } = await supabase.from('students').update({ photo_url: null }).eq('id', studentId)
        if (error) throw error
      }

      // Enrol / move the student into the chosen class arm for the current session.
      if (studentId && sessionId && armId) {
        const { error } = await supabase.from('enrollments').upsert(
          { school_id: schoolId, student_id: studentId, session_id: sessionId, class_arm_id: armId },
          { onConflict: 'student_id,session_id' },
        )
        if (error) throw error
      }
    },
    onSuccess: onSaved,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not save student.'),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={student ? 'Edit student' : 'Add student'}
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
            {student ? 'Save' : 'Add student'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Passport photo */}
        <div className="flex items-center gap-4">
          {showExistingPhoto ? (
            <StudentAvatar photoPath={student!.photo_url} firstName={firstName} lastName={lastName} size={76} />
          ) : (
            <div className="flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xl font-medium text-primary">
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
            <p className="text-xs text-muted">Passport photo · JPG, PNG or WebP · up to 5&nbsp;MB</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="st-first">
            <Input id="st-first" autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last name" htmlFor="st-last">
            <Input id="st-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Middle name" htmlFor="st-middle">
            <Input id="st-middle" value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
          </Field>
          <Field
            label="Admission no."
            htmlFor="st-adm"
            hint={student ? undefined : 'Generated automatically on save.'}
          >
            <Input
              id="st-adm"
              value={student ? admissionNo : 'Assigned automatically'}
              onChange={(e) => setAdmissionNo(e.target.value)}
              disabled={!student}
              placeholder="BWC/2026/001"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Gender" htmlFor="st-gender">
            <Select id="st-gender" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Not set</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </Select>
          </Field>
          <Field label="Date of birth" htmlFor="st-dob">
            <DatePicker
              value={dob}
              onChange={setDob}
              maxYear={new Date().getFullYear()}
              minYear={new Date().getFullYear() - 25}
            />
          </Field>
        </div>

        <Field
          label="Class enrolled"
          htmlFor="st-class"
          hint={!sessionId ? 'Set a current session in Settings → Academics to enrol into a class.' : 'The class for the current session.'}
        >
          <Select id="st-class" value={armId} onChange={(e) => setArmId(e.target.value)} disabled={!sessionId}>
            <option value="">Not enrolled</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>

        {/* Add a new class inline */}
        {sessionId &&
          (!addingClass ? (
            <button
              type="button"
              onClick={() => setAddingClass(true)}
              className="-mt-2 self-start text-sm font-medium text-primary hover:underline"
            >
              + Add a new class
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              <p className="text-xs font-medium text-muted">New class</p>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Level (e.g. JSS1)" value={newLevel} onChange={(e) => setNewLevel(e.target.value)} />
                <Input placeholder="Arm (e.g. A)" value={newArm} onChange={(e) => setNewArm(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => createClass.mutate()}
                  loading={createClass.isPending}
                  disabled={!newLevel.trim() || !newArm.trim()}
                >
                  Create &amp; select
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setAddingClass(false)}>
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-muted">Existing levels are reused; a new arm is added to the class.</p>
            </div>
          ))}

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}
