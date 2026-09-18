import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, ClipboardCheck, Save, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { useSchool } from '@/providers/SchoolProvider'
import { useSync } from '@/providers/SyncProvider'
import type { Database } from '@/types/database'
import { docHeaderHtml, printHtml, tableHtml, type Column } from '@/lib/print'
import { exportSheet } from '@/lib/excel'
import { ExportButtons } from '@/components/ExportButtons'
import { formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/PageHeader'
import { StudentAvatar } from '@/components/StudentAvatar'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type Status = Database['public']['Enums']['attendance_status']

const STATUSES: { value: Status; label: string; short: string; active: string }[] = [
  { value: 'present', label: 'Present', short: 'P', active: 'bg-success text-white border-success' },
  { value: 'absent', label: 'Absent', short: 'A', active: 'bg-danger text-white border-danger' },
  { value: 'late', label: 'Late', short: 'L', active: 'bg-warning text-white border-warning' },
  { value: 'excused', label: 'Excused', short: 'E', active: 'bg-primary text-white border-primary' },
]

interface EnrolledStudent {
  enrollmentId: string
  studentId: string
  firstName: string
  lastName: string
  admissionNo: string | null
  photoPath: string | null
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function AttendancePage() {
  const { user } = useAuth()
  const { activeSchool } = useSchool()
  const { pushOrQueue } = useSync()
  const schoolId = activeSchool?.id
  const [armId, setArmId] = useState('')
  const [date, setDate] = useState(today())
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [detailStudent, setDetailStudent] = useState<EnrolledStudent | null>(null)

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

  const { data: currentTerm } = useQuery({
    queryKey: ['current_term', currentSession?.id],
    enabled: !!currentSession,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terms')
        .select('*')
        .eq('session_id', currentSession!.id)
        .eq('is_current', true)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const { data: arms } = useQuery({
    queryKey: ['class_options', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_arms')
        .select('id, name, class_levels(name, sort_order)')
        .eq('school_id', schoolId!)
      if (error) throw error
      return (data ?? [])
        .map((a) => {
          const level = a.class_levels as unknown as { name: string; sort_order: number } | null
          return { id: a.id as string, label: `${level?.name ?? '—'} ${a.name}` }
        })
        .sort((x, y) => x.label.localeCompare(y.label))
    },
  })

  const { data: roster, isFetching } = useQuery({
    queryKey: ['attendance_roster', armId, currentSession?.id],
    enabled: !!armId && !!currentSession && !!schoolId,
    queryFn: async (): Promise<EnrolledStudent[]> => {
      const { data, error } = await supabase
        .from('enrollments')
        .select('id, student_id, students(first_name, last_name, admission_no, photo_url)')
        .eq('school_id', schoolId!)
        .eq('class_arm_id', armId)
        .eq('session_id', currentSession!.id)
      if (error) throw error
      return (data ?? [])
        .map((r) => {
          const s = r.students as unknown as {
            first_name: string
            last_name: string
            admission_no: string | null
            photo_url: string | null
          } | null
          return {
            enrollmentId: r.id as string,
            studentId: r.student_id as string,
            firstName: s?.first_name ?? '',
            lastName: s?.last_name ?? '',
            admissionNo: s?.admission_no ?? null,
            photoPath: s?.photo_url ?? null,
          }
        })
        .sort((a, b) => a.lastName.localeCompare(b.lastName))
    },
  })

  const { data: existing } = useQuery({
    queryKey: ['attendance_records', armId, date, currentSession?.id],
    enabled: !!roster && roster.length > 0,
    queryFn: async () => {
      const ids = (roster ?? []).map((r) => r.enrollmentId)
      const { data, error } = await supabase
        .from('attendance')
        .select('enrollment_id, status')
        .in('enrollment_id', ids)
        .eq('date', date)
      if (error) throw error
      return data as { enrollment_id: string; status: Status }[]
    },
  })

  // Initialise the status map when the roster or existing records change.
  useEffect(() => {
    if (!roster) return
    const map: Record<string, Status> = {}
    for (const s of roster) map[s.enrollmentId] = 'present'
    for (const rec of existing ?? []) map[rec.enrollment_id] = rec.status
    setStatuses(map)
  }, [roster, existing])

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0 }
    for (const v of Object.values(statuses)) c[v]++
    return c
  }, [statuses])

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return roster ?? []
    return (roster ?? []).filter((s) => `${s.firstName} ${s.lastName} ${s.admissionNo ?? ''}`.toLowerCase().includes(q))
  }, [roster, search])

  const armLabel = arms?.find((a) => a.id === armId)?.label ?? ''

  const dayCols: Column[] = [
    { key: 'adm', label: 'Admission No.' },
    { key: 'name', label: 'Name' },
    { key: 'status', label: 'Status', align: 'center' },
  ]
  const dayRows = () =>
    (roster ?? []).map((s) => {
      const st = statuses[s.enrollmentId] ?? 'present'
      return { adm: s.admissionNo ?? '—', name: `${s.lastName}, ${s.firstName}`, status: st.charAt(0).toUpperCase() + st.slice(1) }
    })
  const exportDayPdf = () => {
    const header = docHeaderHtml({
      name: activeSchool?.name ?? 'School',
      address: activeSchool?.address,
      logoUrl: activeSchool?.logo_url,
      title: 'Daily Attendance',
      subtitle: `${armLabel} · ${formatDate(date)}`,
    })
    printHtml('Daily Attendance', header + tableHtml(dayCols, dayRows()))
  }
  const exportDayXlsx = () => exportSheet('Daily Attendance', dayCols, dayRows(), 'Attendance', 'Daily Attendance')

  const save = useMutation({
    mutationFn: async (): Promise<'synced' | 'queued'> => {
      if (!schoolId || !roster) return 'synced'
      const rows = roster.map((r) => ({
        school_id: schoolId,
        enrollment_id: r.enrollmentId,
        date,
        status: statuses[r.enrollmentId] ?? 'present',
        term_id: currentTerm?.id ?? null,
        marked_by: user?.id ?? null,
      }))
      return pushOrQueue({
        table: 'attendance',
        rows,
        onConflict: 'enrollment_id,date',
        label: `Attendance · ${armLabel} · ${date}`,
      })
    },
    onSuccess: (result) => {
      setSavedMsg(result === 'queued' ? 'Saved offline — will sync' : 'Saved')
      setTimeout(() => setSavedMsg(null), 3000)
    },
  })

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Mark daily attendance for a class. Everyone starts present — flag the exceptions and save."
      />

      {!currentSession && (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          No current session is set. Choose one in <span className="font-medium">Settings → Academics</span>.
        </div>
      )}

      <Card className="mb-4">
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-foreground">Class</label>
            <Select value={armId} onChange={(e) => setArmId(e.target.value)} disabled={!currentSession}>
              <option value="">Select a class…</option>
              {(arms ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:w-64">
            <label className="mb-1.5 block text-sm font-medium text-foreground">Date</label>
            <DatePicker value={date} onChange={setDate} maxYear={new Date().getFullYear()} minYear={new Date().getFullYear() - 2} />
          </div>
        </CardBody>
      </Card>

      {!armId ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-muted">
            <ClipboardCheck className="mx-auto mb-3 h-8 w-8 text-faint" />
            Select a class to begin marking attendance.
          </CardBody>
        </Card>
      ) : isFetching && !roster ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-muted">Loading students…</CardBody>
        </Card>
      ) : !roster || roster.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-muted">
            No students are enrolled in this class for the current session.
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Summary + actions */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Tally label="Present" value={counts.present} tone="text-success" />
              <Tally label="Absent" value={counts.absent} tone="text-danger" />
              <Tally label="Late" value={counts.late} tone="text-warning" />
              <Tally label="Excused" value={counts.excused} tone="text-primary" />
            </div>
            <div className="ml-auto flex items-center gap-3">
              {savedMsg && (
                <span className="flex items-center gap-1 text-sm text-success">
                  <Check className="h-4 w-4" /> {savedMsg}
                </span>
              )}
              <ExportButtons onPdf={exportDayPdf} onExcel={exportDayXlsx} />
              <Button onClick={() => save.mutate()} loading={save.isPending}>
                <Save className="h-4 w-4" /> Save attendance
              </Button>
            </div>
          </div>

          <div className="relative mb-3 max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input className="pl-9" placeholder="Search students" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <Card>
            <ul className="divide-y divide-border">
              {filteredRoster.map((s) => (
                <li key={s.enrollmentId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setDetailStudent(s)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left hover:text-primary"
                    title="View attendance history"
                  >
                    <StudentAvatar photoPath={s.photoPath} firstName={s.firstName} lastName={s.lastName} size={36} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {s.lastName}, {s.firstName}
                      </p>
                      {s.admissionNo && <p className="font-mono text-xs text-muted">{s.admissionNo}</p>}
                    </div>
                  </button>
                  <div className="flex gap-1">
                    {STATUSES.map((st) => {
                      const active = (statuses[s.enrollmentId] ?? 'present') === st.value
                      return (
                        <button
                          key={st.value}
                          title={st.label}
                          onClick={() => setStatuses((m) => ({ ...m, [s.enrollmentId]: st.value }))}
                          className={cn(
                            'h-8 w-8 rounded-md border text-sm font-medium transition-colors',
                            active
                              ? st.active
                              : 'border-border bg-surface text-muted hover:bg-muted-surface',
                          )}
                        >
                          {st.short}
                        </button>
                      )
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {detailStudent && activeSchool && (
        <StudentAttendanceDialog student={detailStudent} school={activeSchool} onClose={() => setDetailStudent(null)} />
      )}
    </div>
  )
}

function Tally({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1">
      <span className={cn('font-semibold tabular-nums', tone)}>{value}</span>
      <span className="text-muted">{label}</span>
    </span>
  )
}

const STATUS_LABEL: Record<string, string> = { present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused' }

function StudentAttendanceDialog({
  student,
  school,
  onClose,
}: {
  student: EnrolledStudent
  school: { id: string; name: string; address: string | null; logo_url: string | null }
  onClose: () => void
}) {
  const { data } = useQuery({
    queryKey: ['student_attendance', student.enrollmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select('date, status')
        .eq('enrollment_id', student.enrollmentId)
        .order('date', { ascending: false })
      if (error) throw error
      return data as { date: string; status: Status }[]
    },
  })

  const records = data ?? []
  const counts = { present: 0, absent: 0, late: 0, excused: 0 }
  for (const r of records) counts[r.status]++
  const marked = records.length
  const rate = marked ? Math.round(((counts.present + counts.late) / marked) * 100) : null

  const recCols: Column[] = [
    { key: 'date', label: 'Date' },
    { key: 'status', label: 'Status', align: 'center' },
  ]
  const recRows = () =>
    records.map((r) => ({ date: formatDate(r.date, { day: 'numeric', month: 'short', year: 'numeric' }), status: STATUS_LABEL[r.status] }))
  const exportPdf = () => {
    const header = docHeaderHtml({
      name: school.name,
      address: school.address,
      logoUrl: school.logo_url,
      title: 'Attendance Record',
      subtitle: `${student.lastName}, ${student.firstName}${student.admissionNo ? ' · ' + student.admissionNo : ''} · Present ${counts.present + counts.late}/${marked}${rate != null ? ' (' + rate + '%)' : ''}`,
    })
    printHtml('Attendance Record', header + tableHtml(recCols, recRows()))
  }
  const exportXlsx = () =>
    exportSheet(`Attendance - ${student.lastName} ${student.firstName}`, recCols, recRows(), 'Attendance', 'Attendance Record')

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${student.firstName} ${student.lastName}`}
      description={student.admissionNo ?? undefined}
      className="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <ExportButtons onPdf={exportPdf} onExcel={exportXlsx} size="sm" />
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-4 gap-2 text-center text-sm">
          <MiniStat label="Present" value={counts.present} tone="text-success" />
          <MiniStat label="Absent" value={counts.absent} tone="text-danger" />
          <MiniStat label="Late" value={counts.late} tone="text-warning" />
          <MiniStat label="Excused" value={counts.excused} tone="text-primary" />
        </div>
        {rate != null && (
          <p className="text-sm text-muted">
            Attendance rate: <span className="font-semibold text-foreground">{rate}%</span> over {marked} day(s).
          </p>
        )}
        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          {records.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">No attendance recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {records.map((r, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-2">
                  <span>{formatDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      r.status === 'present' ? 'bg-success/15 text-success'
                        : r.status === 'absent' ? 'bg-danger/15 text-danger'
                        : r.status === 'late' ? 'bg-warning/15 text-warning'
                        : 'bg-primary/10 text-primary',
                    )}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-border py-2">
      <p className={cn('font-serif text-xl font-semibold tabular-nums', tone)}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}
