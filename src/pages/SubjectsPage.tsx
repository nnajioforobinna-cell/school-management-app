import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSchool } from '@/providers/SchoolProvider'
import type { Tables } from '@/types/database'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { FullScreenLoader } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

type Subject = Tables<'subjects'>
type Tab = 'list' | 'assign'

export function SubjectsPage() {
  const { activeSchool } = useSchool()
  const schoolId = activeSchool?.id
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Subject | null>(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('list')

  const { data: subjects, isLoading } = useQuery({
    queryKey: ['subjects', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subjects')
        .select('*')
        .eq('school_id', schoolId!)
        .order('name')
      if (error) throw error
      return data as Subject[]
    },
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('subjects').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subjects', schoolId] }),
  })

  const openNew = () => {
    setEditing(null)
    setOpen(true)
  }
  const openEdit = (s: Subject) => {
    setEditing(s)
    setOpen(true)
  }

  if (isLoading) return <FullScreenLoader />

  return (
    <div>
      <PageHeader
        title="Subjects"
        description="The subjects taught in your school, and which subjects each student offers."
        action={
          tab === 'list' ? (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> Add subject
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex gap-1">
        {([
          { id: 'list', label: 'Subjects' },
          { id: 'assign', label: 'Assign to classes' },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-muted-surface hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'assign' ? (
        schoolId && <ClassSubjectsTab schoolId={schoolId} subjects={subjects ?? []} />
      ) : (
      <Card>
        {!subjects || subjects.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No subjects yet"
            description="Add the subjects your school teaches, e.g. Mathematics, English Language, Basic Science."
            action={
              <Button onClick={openNew}>
                <Plus className="h-4 w-4" /> Add your first subject
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {subjects.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{s.name}</p>
                  <p className="text-xs text-muted">
                    {s.code ? <span className="font-mono">{s.code}</span> : 'No code'}
                    {' · '}
                    {s.is_core ? 'Core' : 'Elective'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(s)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete "${s.name}"? This cannot be undone.`)) del.mutate(s.id)
                    }}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      )}

      {open && schoolId && (
        <SubjectDialog
          schoolId={schoolId}
          subject={editing}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false)
            qc.invalidateQueries({ queryKey: ['subjects', schoolId] })
          }}
        />
      )}
    </div>
  )
}

function SubjectDialog({
  schoolId,
  subject,
  onClose,
  onSaved,
}: {
  schoolId: string
  subject: Subject | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(subject?.name ?? '')
  const [code, setCode] = useState(subject?.code ?? '')
  const [isCore, setIsCore] = useState(subject?.is_core ?? true)
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), code: code.trim() || null, is_core: isCore }
      if (subject) {
        const { error } = await supabase.from('subjects').update(payload).eq('id', subject.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('subjects').insert({ ...payload, school_id: schoolId })
        if (error) throw error
      }
    },
    onSuccess: onSaved,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not save subject.'),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={subject ? 'Edit subject' : 'Add subject'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>
            {subject ? 'Save' : 'Add subject'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Subject name" htmlFor="s-name">
          <Input id="s-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Mathematics" />
        </Field>
        <Field label="Code" htmlFor="s-code" hint="Optional short code shown on records.">
          <Input id="s-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="MTH" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isCore}
            onChange={(e) => setIsCore(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-[var(--primary)]"
          />
          Core subject (taken by all students)
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Assign subjects to classes / students                               */
/* ------------------------------------------------------------------ */
interface RosterStudent {
  id: string
  name: string
  admissionNo: string | null
}

function ClassSubjectsTab({ schoolId, subjects }: { schoolId: string; subjects: Subject[] }) {
  const qc = useQueryClient()
  const [armId, setArmId] = useState('')
  const [bulk, setBulk] = useState<Set<string>>(new Set())
  const [bulkInit, setBulkInit] = useState(false)
  const [editStudent, setEditStudent] = useState<RosterStudent | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const { data: session } = useQuery({
    queryKey: ['current_session', schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from('academic_sessions')
        .select('*')
        .eq('school_id', schoolId)
        .eq('is_current', true)
        .maybeSingle()
      return data
    },
  })

  const { data: arms } = useQuery({
    queryKey: ['class_options_lvl', schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from('class_arms')
        .select('id, name, class_level_id, class_levels(name, sort_order)')
        .eq('school_id', schoolId)
      return (data ?? [])
        .map((a) => {
          const lvl = a.class_levels as unknown as { name: string } | null
          return { id: a.id as string, label: `${lvl?.name ?? '—'} ${a.name}` }
        })
        .sort((x, y) => x.label.localeCompare(y.label))
    },
  })

  const { data: roster } = useQuery({
    queryKey: ['class_students_subjects', schoolId, armId, session?.id],
    enabled: !!armId && !!session,
    queryFn: async () => {
      const { data: enr } = await supabase
        .from('enrollments')
        .select('student_id, students(first_name, last_name, admission_no)')
        .eq('school_id', schoolId)
        .eq('class_arm_id', armId)
        .eq('session_id', session!.id)
      const list: RosterStudent[] = (enr ?? [])
        .map((r) => {
          const s = r.students as unknown as { first_name: string; last_name: string; admission_no: string | null } | null
          return { id: r.student_id as string, name: s ? `${s.last_name}, ${s.first_name}` : '', admissionNo: s?.admission_no ?? null }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
      const ids = list.map((s) => s.id)
      const offered = new Map<string, Set<string>>()
      if (ids.length) {
        const { data: ss } = await supabase
          .from('student_subjects')
          .select('student_id, subject_id')
          .eq('school_id', schoolId)
          .eq('session_id', session!.id)
          .in('student_id', ids)
        for (const r of ss ?? []) {
          const set = offered.get(r.student_id as string) ?? new Set<string>()
          set.add(r.subject_id as string)
          offered.set(r.student_id as string, set)
        }
      }
      return { list, offered }
    },
  })

  // Default the class selection to the core subjects, once.
  useEffect(() => {
    if (!bulkInit && subjects.length) {
      setBulk(new Set(subjects.filter((s) => s.is_core).map((s) => s.id)))
      setBulkInit(true)
    }
  }, [subjects, bulkInit])

  const subjectName = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects])

  const applyAll = useMutation({
    mutationFn: async () => {
      if (!session || !roster) return
      const ids = roster.list.map((s) => s.id)
      if (!ids.length) return
      await supabase.from('student_subjects').delete().eq('school_id', schoolId).eq('session_id', session.id).in('student_id', ids)
      const rows = ids.flatMap((sid) => [...bulk].map((subid) => ({ school_id: schoolId, student_id: sid, subject_id: subid, session_id: session.id })))
      if (rows.length) {
        const { error } = await supabase.from('student_subjects').insert(rows)
        if (error) throw error
      }
    },
    onSuccess: () => {
      setMsg('Applied to all students in this class')
      setTimeout(() => setMsg(null), 2500)
      qc.invalidateQueries({ queryKey: ['class_students_subjects', schoolId, armId, session?.id] })
    },
  })

  const toggleBulk = (id: string) =>
    setBulk((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (!session) {
    return (
      <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
        Set a current session in <span className="font-medium">Settings → Academics</span> first.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Class</label>
          <Select value={armId} onChange={(e) => setArmId(e.target.value)} className="sm:max-w-sm">
            <option value="">Select a class…</option>
            {(arms ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </Select>
          <p className="mt-2 text-xs text-muted">
            Tip: leave a student with no subjects to mean “takes all subjects” — so JSS needs no setup; use this for SSS electives.
          </p>
        </CardBody>
      </Card>

      {armId && (
        <>
          <Card>
            <CardBody className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Set subjects for the whole class</p>
                <p className="text-xs text-muted">Pick the subjects, then apply them to every student in this class. You can fine-tune individuals below.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {subjects.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleBulk(s.id)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm transition-colors',
                      bulk.has(s.id) ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-surface text-muted hover:bg-muted-surface',
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => {
                    if (confirm(`Apply ${bulk.size} subject(s) to all ${roster?.list.length ?? 0} students in this class? This replaces their current subject selections.`))
                      applyAll.mutate()
                  }}
                  loading={applyAll.isPending}
                  disabled={!roster?.list.length}
                >
                  Apply to all {roster?.list.length ?? 0} students
                </Button>
                {msg && (
                  <span className="flex items-center gap-1 text-sm text-success">
                    <Check className="h-4 w-4" /> {msg}
                  </span>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            {!roster || roster.list.length === 0 ? (
              <CardBody className="py-10 text-center text-sm text-muted">No students enrolled in this class.</CardBody>
            ) : (
              <ul className="divide-y divide-border">
                {roster.list.map((st) => {
                  const set = roster.offered.get(st.id)
                  return (
                    <li key={st.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{st.name}</p>
                        <p className="truncate text-xs text-muted">
                          {!set || set.size === 0
                            ? 'All subjects (default)'
                            : [...set].map((id) => subjectName.get(id) ?? '—').sort().join(', ')}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setEditStudent(st)}>
                        Edit
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      {editStudent && session && (
        <StudentSubjectsDialog
          schoolId={schoolId}
          sessionId={session.id}
          student={editStudent}
          subjects={subjects}
          current={roster?.offered.get(editStudent.id) ?? new Set()}
          onClose={() => setEditStudent(null)}
          onSaved={() => {
            setEditStudent(null)
            qc.invalidateQueries({ queryKey: ['class_students_subjects', schoolId, armId, session.id] })
          }}
        />
      )}
    </div>
  )
}

function StudentSubjectsDialog({
  schoolId,
  sessionId,
  student,
  subjects,
  current,
  onClose,
  onSaved,
}: {
  schoolId: string
  sessionId: string
  student: RosterStudent
  subjects: Subject[]
  current: Set<string>
  onClose: () => void
  onSaved: () => void
}) {
  // If the student has no explicit selection, they effectively take all — so
  // pre-check everything, and let the teacher uncheck the ones they don't offer.
  const [selected, setSelected] = useState<Set<string>>(
    current.size ? new Set(current) : new Set(subjects.map((s) => s.id)),
  )
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      await supabase.from('student_subjects').delete().eq('school_id', schoolId).eq('session_id', sessionId).eq('student_id', student.id)
      const rows = [...selected].map((subid) => ({ school_id: schoolId, student_id: student.id, subject_id: subid, session_id: sessionId }))
      if (rows.length) {
        const { error } = await supabase.from('student_subjects').insert(rows)
        if (error) throw error
      }
    },
    onSuccess: onSaved,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not save subjects.'),
  })

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Subjects — ${student.name}`}
      description="Tick the subjects this student offers this session."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>Save subjects</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {subjects.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                selected.has(s.id) ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-surface text-muted hover:bg-muted-surface',
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">{selected.size} subject(s) selected.</p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}
