import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Check, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSchool } from '@/providers/SchoolProvider'
import type { Tables } from '@/types/database'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'

type Session = Tables<'academic_sessions'>
type Term = Tables<'terms'>

const TERM_LABEL: Record<string, string> = { first: 'First Term', second: 'Second Term', third: 'Third Term' }

export function AcademicsTab() {
  const { activeSchool, refetch } = useSchool()
  const schoolId = activeSchool?.id
  const qc = useQueryClient()
  const [sessionDialog, setSessionDialog] = useState(false)
  const [termDialog, setTermDialog] = useState(false)
  const [promoteDialog, setPromoteDialog] = useState(false)

  const settings = (activeSchool?.settings ?? {}) as Record<string, unknown>
  const showAttendance = settings.report_show_attendance !== false

  const toggleAttendance = useMutation({
    mutationFn: async (value: boolean) => {
      const next = { ...settings, report_show_attendance: value }
      const { error } = await supabase.from('schools').update({ settings: next }).eq('id', schoolId!)
      if (error) throw error
    },
    onSuccess: () => refetch(),
  })

  const { data: sessions } = useQuery({
    queryKey: ['academic_sessions', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academic_sessions')
        .select('*')
        .eq('school_id', schoolId!)
        .order('name', { ascending: false })
      if (error) throw error
      return data as Session[]
    },
  })

  const currentSession = (sessions ?? []).find((s) => s.is_current) ?? null

  // Terms are managed for a chosen session (defaults to the current one).
  const [selectedSessionId, setSelectedSessionId] = useState<string>('')
  const selectedSession =
    (sessions ?? []).find((s) => s.id === selectedSessionId) ?? currentSession ?? (sessions ?? [])[0] ?? null

  const { data: terms } = useQuery({
    queryKey: ['terms', selectedSession?.id],
    enabled: !!selectedSession,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terms')
        .select('*')
        .eq('session_id', selectedSession!.id)
        .order('name')
      if (error) throw error
      return data as Term[]
    },
  })

  const setCurrentSession = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('academic_sessions').update({ is_current: false }).eq('school_id', schoolId!)
      const { error } = await supabase.from('academic_sessions').update({ is_current: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['academic_sessions', schoolId] }),
  })

  const delSession = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('academic_sessions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['academic_sessions', schoolId] }),
  })

  const setCurrentTerm = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('terms').update({ is_current: false }).eq('session_id', selectedSession!.id)
      const { error } = await supabase.from('terms').update({ is_current: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['terms', selectedSession?.id] }),
  })

  const usedTerms = new Set((terms ?? []).map((t) => t.name))

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Academic sessions"
          description="Each academic year is a session, e.g. 2025/2026. One is current at a time."
          action={
            <Button size="sm" onClick={() => setSessionDialog(true)}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          }
        />
        {!sessions || sessions.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No sessions yet"
            description="Add your first academic session to begin, then set it as current."
          />
        ) : (
          <ul className="divide-y divide-border">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    {s.name}
                    {s.is_current && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Current
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {s.start_date || '—'} to {s.end_date || '—'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!s.is_current && (
                    <Button variant="outline" size="sm" onClick={() => setCurrentSession.mutate(s.id)}>
                      Set current
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete session "${s.name}" and its terms? This cannot be undone.`))
                        delSession.mutate(s.id)
                    }}
                    aria-label="Delete session"
                  >
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Terms"
          description="Add the terms (First, Second, Third) for a session and set which one is current."
          action={
            selectedSession && usedTerms.size < 3 ? (
              <Button size="sm" onClick={() => setTermDialog(true)}>
                <Plus className="h-4 w-4" /> Add term
              </Button>
            ) : undefined
          }
        />
        <CardBody className="flex flex-col gap-4">
          {!sessions || sessions.length === 0 ? (
            <p className="text-sm text-muted">Add an academic session above first, then add its terms here.</p>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Session</label>
                <Select
                  value={selectedSession?.id ?? ''}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="sm:max-w-xs"
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.is_current ? ' (current)' : ''}
                    </option>
                  ))}
                </Select>
              </div>

              {!terms || terms.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                  No terms for {selectedSession?.name} yet. Click <span className="font-medium text-foreground">Add term</span> to create First, Second and Third terms.
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {terms.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-2.5"
                    >
                      <div>
                        <p className="flex items-center gap-2 font-medium text-foreground">
                          {TERM_LABEL[t.name] ?? t.name}
                          {t.is_current && <Check className="h-4 w-4 text-primary" />}
                        </p>
                        <p className="text-xs text-muted">
                          {t.start_date || '—'} to {t.end_date || '—'}
                          {t.resumption_date ? ` · resumes ${t.resumption_date}` : ''}
                        </p>
                      </div>
                      {!t.is_current && (
                        <Button variant="outline" size="sm" onClick={() => setCurrentTerm.mutate(t.id)}>
                          Set current
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {usedTerms.size >= 3 && (
                <p className="text-xs text-muted">All three terms exist for this session.</p>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Promotion & graduation"
          description="At year-end, move each class up to the next one and graduate the final-year students."
          action={
            <Button size="sm" variant="outline" onClick={() => setPromoteDialog(true)} disabled={(sessions?.length ?? 0) < 2}>
              Promote students
            </Button>
          }
        />
        <CardBody>
          <p className="text-sm text-muted">
            Promotes every class to the next level in a new session (e.g. JSS 1 → JSS 2), and graduates the highest
            class. Repeaters can be moved back afterwards from the <span className="font-medium text-foreground">Students</span> page.
            {(sessions?.length ?? 0) < 2 && (
              <span className="mt-1 block text-warning">Add the new session above first, then run promotion.</span>
            )}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Report card options" description="Control what appears on printed report cards." />
        <CardBody>
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-medium text-foreground">Include attendance summary</span>
              <span className="block text-xs text-muted">Show days present / absent on each report card.</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={showAttendance}
              onClick={() => toggleAttendance.mutate(!showAttendance)}
              disabled={toggleAttendance.isPending}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${showAttendance ? 'bg-primary' : 'bg-border-strong'}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${showAttendance ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
              />
            </button>
          </label>
        </CardBody>
      </Card>

      {sessionDialog && schoolId && (
        <SessionDialog
          schoolId={schoolId}
          firstSession={(sessions?.length ?? 0) === 0}
          onClose={() => setSessionDialog(false)}
          onSaved={() => {
            setSessionDialog(false)
            qc.invalidateQueries({ queryKey: ['academic_sessions', schoolId] })
          }}
        />
      )}

      {termDialog && selectedSession && schoolId && (
        <TermDialog
          schoolId={schoolId}
          session={selectedSession}
          usedTerms={usedTerms}
          onClose={() => setTermDialog(false)}
          onSaved={() => {
            setTermDialog(false)
            qc.invalidateQueries({ queryKey: ['terms', selectedSession.id] })
          }}
        />
      )}

      {promoteDialog && schoolId && (
        <PromotionDialog
          schoolId={schoolId}
          sessions={sessions ?? []}
          currentSessionId={currentSession?.id ?? null}
          onClose={() => setPromoteDialog(false)}
          onDone={() => {
            setPromoteDialog(false)
            qc.invalidateQueries({ queryKey: ['academic_sessions', schoolId] })
            refetch()
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Promotion & graduation wizard                                       */
/* ------------------------------------------------------------------ */
interface SourceArm {
  armId: string
  levelId: string
  levelName: string
  armName: string
  label: string
  count: number
  studentIds: string[]
  nextLevelId: string | null
  nextLevelName: string
  nextArms: { id: string; label: string }[]
  sameNameTargetId: string | null
}

const CREATE = '__create__'

function PromotionDialog({
  schoolId,
  sessions,
  currentSessionId,
  onClose,
  onDone,
}: {
  schoolId: string
  sessions: Session[]
  currentSessionId: string | null
  onClose: () => void
  onDone: () => void
}) {
  const [fromId, setFromId] = useState(currentSessionId ?? sessions[0]?.id ?? '')
  const [toId, setToId] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [makeCurrent, setMakeCurrent] = useState(true)
  const [dest, setDest] = useState<Record<string, string>>({})
  const [destKey, setDestKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const { data: plan, isFetching } = useQuery({
    queryKey: ['promotion_plan', schoolId, fromId],
    enabled: !!fromId,
    queryFn: async (): Promise<SourceArm[]> => {
      const [{ data: levels }, { data: arms }, { data: enr }] = await Promise.all([
        supabase.from('class_levels').select('id, name, sort_order').eq('school_id', schoolId).order('sort_order'),
        supabase.from('class_arms').select('id, name, class_level_id').eq('school_id', schoolId),
        supabase
          .from('enrollments')
          .select('student_id, class_arm_id, students(status)')
          .eq('school_id', schoolId)
          .eq('session_id', fromId),
      ])
      const levelList = (levels ?? []) as { id: string; name: string; sort_order: number }[]
      const armList = (arms ?? []) as { id: string; name: string; class_level_id: string }[]
      const armById = new Map(armList.map((a) => [a.id, a]))
      const levelById = new Map(levelList.map((l) => [l.id, l]))
      const armsByLevel = new Map<string, { id: string; name: string; label: string }[]>()
      for (const a of armList) {
        const arr = armsByLevel.get(a.class_level_id) ?? []
        arr.push({ id: a.id, name: a.name, label: `${levelById.get(a.class_level_id)?.name ?? '—'} ${a.name}` })
        armsByLevel.set(a.class_level_id, arr)
      }
      const nextLevelId = (levelId: string): string | null => {
        const lvl = levelById.get(levelId)
        if (!lvl) return null
        return levelList.find((l) => l.sort_order > lvl.sort_order)?.id ?? null
      }

      // Group active students by their current arm.
      const byArm = new Map<string, string[]>()
      for (const e of enr ?? []) {
        const st = e.students as unknown as { status: string } | null
        if (!st || st.status !== 'active') continue
        const arr = byArm.get(e.class_arm_id as string) ?? []
        arr.push(e.student_id as string)
        byArm.set(e.class_arm_id as string, arr)
      }

      const out: SourceArm[] = []
      for (const [armId, studentIds] of byArm) {
        const arm = armById.get(armId)
        if (!arm) continue
        const levelName = levelById.get(arm.class_level_id)?.name ?? '—'
        const next = nextLevelId(arm.class_level_id)
        const nextArms = next ? (armsByLevel.get(next) ?? []).map((a) => ({ id: a.id, label: a.label })) : []
        const sameNameTargetId = next ? (armsByLevel.get(next) ?? []).find((a) => a.name === arm.name)?.id ?? null : null
        out.push({
          armId,
          levelId: arm.class_level_id,
          levelName,
          armName: arm.name,
          label: `${levelName} ${arm.name}`,
          count: studentIds.length,
          studentIds,
          nextLevelId: next,
          nextLevelName: next ? (levelById.get(next)?.name ?? '') : '',
          nextArms,
          sameNameTargetId,
        })
      }
      return out.sort((a, b) => a.label.localeCompare(b.label))
    },
  })

  // Default each source arm's destination once the plan for this session loads.
  useEffect(() => {
    if (!plan) return
    const key = `${fromId}:${plan.map((p) => p.armId).join(',')}`
    if (destKey === key) return
    const next: Record<string, string> = {}
    for (const p of plan) {
      if (p.nextLevelId) next[p.armId] = p.sameNameTargetId ?? CREATE
    }
    setDest(next)
    setDestKey(key)
  }, [plan, fromId, destKey])

  const levels = Array.from(new Map((plan ?? []).map((r) => [r.levelId, r.levelName])).entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const visible = levelFilter ? (plan ?? []).filter((r) => r.levelId === levelFilter) : plan ?? []

  const promoteCount = visible.filter((r) => r.nextLevelId).reduce((n, r) => n + r.count, 0)
  const graduateCount = visible.filter((r) => !r.nextLevelId).reduce((n, r) => n + r.count, 0)

  const run = useMutation({
    mutationFn: async () => {
      if (!toId) throw new Error('Choose the new session to promote into.')
      if (toId === fromId) throw new Error('The new session must be different from the current one.')

      for (const arm of visible) {
        if (!arm.nextLevelId) continue
        let targetArmId = dest[arm.armId]
        if (!targetArmId) throw new Error(`Choose where ${arm.label} goes.`)
        if (targetArmId === CREATE) {
          const { data: created, error } = await supabase
            .from('class_arms')
            .insert({ school_id: schoolId, class_level_id: arm.nextLevelId, name: arm.armName })
            .select('id')
            .single()
          if (error) throw error
          targetArmId = created!.id as string
        }
        const rows = arm.studentIds.map((sid) => ({
          school_id: schoolId,
          student_id: sid,
          class_arm_id: targetArmId,
          session_id: toId,
        }))
        const { error } = await supabase.from('enrollments').upsert(rows, { onConflict: 'student_id,session_id' })
        if (error) throw error
      }

      const grads = visible.filter((r) => !r.nextLevelId).flatMap((r) => r.studentIds)
      if (grads.length) {
        const { error } = await supabase.from('students').update({ status: 'graduated' }).in('id', grads)
        if (error) throw error
      }
      if (makeCurrent) {
        await supabase.from('academic_sessions').update({ is_current: false }).eq('school_id', schoolId)
        await supabase.from('academic_sessions').update({ is_current: true }).eq('id', toId)
      }
    },
    onSuccess: () => setDone(`Promoted ${promoteCount}, graduated ${graduateCount}.`),
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not run promotion.'),
  })

  const fromName = sessions.find((s) => s.id === fromId)?.name ?? ''

  return (
    <Dialog
      open
      onClose={onClose}
      title="Promote students"
      description="Send each class up to the next one for the new session."
      className="max-w-xl"
      footer={
        done ? (
          <Button onClick={onDone}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => {
                if (confirm(`Promote ${promoteCount} student(s) and graduate ${graduateCount}? Repeaters can be moved back afterwards.`))
                  run.mutate()
              }}
              loading={run.isPending}
              disabled={!toId || promoteCount + graduateCount === 0}
            >
              Run promotion
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="h-6 w-6" />
          </span>
          <div>
            <p className="font-medium text-foreground">{done}</p>
            <p className="mt-1 text-sm text-muted">Now move any repeaters back to their previous class from the Students page.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="From (current) session" htmlFor="pr-from">
              <Select id="pr-from" value={fromId} onChange={(e) => setFromId(e.target.value)}>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.is_current ? ' (current)' : ''}</option>
                ))}
              </Select>
            </Field>
            <Field label="Into (new) session" htmlFor="pr-to">
              <Select id="pr-to" value={toId} onChange={(e) => setToId(e.target.value)}>
                <option value="">Select…</option>
                {sessions.filter((s) => s.id !== fromId).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
          </div>

          {isFetching ? (
            <p className="text-sm text-muted">Building the plan…</p>
          ) : (
            <>
              {levels.length > 1 && (
                <Field label="Class to promote" htmlFor="pr-level" hint="Promote one class, or leave as all.">
                  <Select id="pr-level" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
                    <option value="">All classes</option>
                    {levels.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </Select>
                </Field>
              )}

              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-faint">Where each class goes</p>
                {visible.length === 0 ? (
                  <div className="rounded-md border border-border px-4 py-3 text-sm text-muted">
                    No students in this selection for {fromName}.
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {visible.map((arm) => (
                      <li key={arm.armId} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground">{arm.label}</p>
                          <p className="text-xs text-muted">{arm.count} student{arm.count === 1 ? '' : 's'}</p>
                        </div>
                        <span className="text-faint">&rarr;</span>
                        {arm.nextLevelId ? (
                          <Select
                            value={dest[arm.armId] ?? CREATE}
                            onChange={(e) => setDest((m) => ({ ...m, [arm.armId]: e.target.value }))}
                            className="w-auto min-w-[10rem]"
                          >
                            {arm.nextArms.map((a) => (
                              <option key={a.id} value={a.id}>{a.label}</option>
                            ))}
                            <option value={CREATE}>+ New {arm.nextLevelName} {arm.armName}</option>
                          </Select>
                        ) : (
                          <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">Graduate</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-center text-sm">
                <Stat label="Promoting" value={promoteCount} tone="text-success" />
                <Stat label="Graduating" value={graduateCount} tone="text-warning" />
              </div>

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={makeCurrent}
                  onChange={(e) => setMakeCurrent(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-[var(--primary)]"
                />
                Set the new session as current after promoting
              </label>
              <p className="text-xs text-muted">
                Pick an existing arm to merge classes, or &ldquo;+ New&hellip;&rdquo; to create the next arm.
              </p>
            </>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
    </Dialog>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md border border-border py-2">
      <p className={`font-serif text-lg font-semibold tabular-nums ${tone ?? 'text-foreground'}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

function SessionDialog({
  schoolId,
  firstSession,
  onClose,
  onSaved,
}: {
  schoolId: string
  firstSession: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [makeCurrent, setMakeCurrent] = useState(firstSession)
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      if (makeCurrent) {
        await supabase.from('academic_sessions').update({ is_current: false }).eq('school_id', schoolId)
      }
      const { error } = await supabase.from('academic_sessions').insert({
        school_id: schoolId,
        name: name.trim(),
        start_date: start || null,
        end_date: end || null,
        is_current: makeCurrent,
      })
      if (error) throw error
    },
    onSuccess: onSaved,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not save session.'),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add academic session"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>
            Add session
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Session name" htmlFor="ses-name" hint="e.g. 2025/2026">
          <Input id="ses-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="2025/2026" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date" htmlFor="ses-start">
            <DatePicker value={start} onChange={setStart} />
          </Field>
          <Field label="End date" htmlFor="ses-end">
            <DatePicker value={end} onChange={setEnd} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={makeCurrent}
            onChange={(e) => setMakeCurrent(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-[var(--primary)]"
          />
          Set as the current session
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}

function TermDialog({
  schoolId,
  session,
  usedTerms,
  onClose,
  onSaved,
}: {
  schoolId: string
  session: Session
  usedTerms: Set<string>
  onClose: () => void
  onSaved: () => void
}) {
  const available = (['first', 'second', 'third'] as const).filter((t) => !usedTerms.has(t))
  const [name, setName] = useState<string>(available[0] ?? 'first')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [resumption, setResumption] = useState('')
  const [makeCurrent, setMakeCurrent] = useState(usedTerms.size === 0)
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      if (makeCurrent) {
        await supabase.from('terms').update({ is_current: false }).eq('session_id', session.id)
      }
      const { error } = await supabase.from('terms').insert({
        school_id: schoolId,
        session_id: session.id,
        name: name as Term['name'],
        start_date: start || null,
        end_date: end || null,
        resumption_date: resumption || null,
        is_current: makeCurrent,
      })
      if (error) throw error
    },
    onSuccess: onSaved,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not save term.'),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Add term to ${session.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Add term
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Term" htmlFor="t-name">
          <Select id="t-name" value={name} onChange={(e) => setName(e.target.value)}>
            {available.map((t) => (
              <option key={t} value={t}>
                {TERM_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date" htmlFor="t-start">
            <DatePicker value={start} onChange={setStart} />
          </Field>
          <Field label="End date" htmlFor="t-end">
            <DatePicker value={end} onChange={setEnd} />
          </Field>
        </div>
        <Field label="Resumption date" htmlFor="t-res" hint="Shown on report cards as 'next term begins'.">
          <DatePicker value={resumption} onChange={setResumption} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={makeCurrent}
            onChange={(e) => setMakeCurrent(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-[var(--primary)]"
          />
          Set as the current term
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}
