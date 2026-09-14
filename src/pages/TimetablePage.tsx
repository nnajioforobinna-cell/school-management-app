import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSchool } from '@/providers/SchoolProvider'
import type { Tables } from '@/types/database'
import { docHeaderHtml, printHtml, tableHtml } from '@/lib/print'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { Dialog } from '@/components/ui/dialog'

type Entry = Tables<'timetable_entries'>

const DAYS = [
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
]
export function TimetablePage() {
  const { activeSchool, activeRole, refetch } = useSchool()
  const schoolId = activeSchool!.id
  const qc = useQueryClient()
  const canManage = activeRole === 'owner' || activeRole === 'admin'
  const [armId, setArmId] = useState('')
  const [cell, setCell] = useState<{ day: number; period: number } | null>(null)

  const settings = (activeSchool?.settings ?? {}) as Record<string, unknown>
  const periodCount = Math.min(15, Math.max(1, Number(settings.timetable_periods) || 8))
  const PERIODS = Array.from({ length: periodCount }, (_, i) => i + 1)

  const setPeriods = useMutation({
    mutationFn: async (n: number) => {
      const next = { ...settings, timetable_periods: Math.min(15, Math.max(1, n)) }
      const { error } = await supabase.from('schools').update({ settings: next }).eq('id', schoolId)
      if (error) throw error
    },
    onSuccess: () => refetch(),
  })

  const { data: arms } = useQuery({
    queryKey: ['class_options', schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from('class_arms')
        .select('id, name, class_levels(name, sort_order)')
        .eq('school_id', schoolId)
      return (data ?? []).map((a) => {
        const l = a.class_levels as unknown as { name: string; sort_order: number } | null
        return { id: a.id as string, label: `${l?.name ?? '—'} ${a.name}` }
      }).sort((x, y) => x.label.localeCompare(y.label))
    },
  })

  const { data: subjects } = useQuery({
    queryKey: ['subjects', schoolId],
    queryFn: async () => {
      const { data } = await supabase.from('subjects').select('id, name').eq('school_id', schoolId).order('name')
      return (data ?? []) as { id: string; name: string }[]
    },
  })
  const { data: staff } = useQuery({
    queryKey: ['staff_list', schoolId],
    queryFn: async () => {
      const { data } = await supabase.from('staff').select('id, first_name, last_name').eq('school_id', schoolId).order('last_name')
      return (data ?? []) as { id: string; first_name: string; last_name: string }[]
    },
  })

  const { data: entries } = useQuery({
    queryKey: ['timetable', armId],
    enabled: !!armId,
    queryFn: async () => {
      const { data } = await supabase.from('timetable_entries').select('*').eq('class_arm_id', armId)
      const map = new Map<string, Entry>()
      for (const e of (data ?? []) as Entry[]) map.set(`${e.day_of_week}:${e.period}`, e)
      return map
    },
  })

  const subjectName = (id: string | null) => subjects?.find((s) => s.id === id)?.name ?? ''
  const staffName = (id: string | null) => {
    const s = staff?.find((x) => x.id === id)
    return s ? `${s.first_name.charAt(0)}. ${s.last_name}` : ''
  }

  const exportTimetable = () => {
    const rows = PERIODS.map((p) => {
      const row: Record<string, unknown> = { period: `Period ${p}` }
      // Period time range — taken from the first day in this period that has times set.
      let time = ''
      for (const d of DAYS) {
        const e = entries?.get(`${d.n}:${p}`)
        if (e && (e.start_time || e.end_time)) {
          time = `${e.start_time ?? ''}${e.start_time && e.end_time ? ' – ' : ''}${e.end_time ?? ''}`
          break
        }
      }
      row.time = time || '—'
      for (const d of DAYS) {
        const e = entries?.get(`${d.n}:${p}`)
        row[`d${d.n}`] = !e
          ? '—'
          : e.note && !e.subject_id
            ? e.note
            : `${subjectName(e.subject_id) || e.note || 'Subject'}${e.staff_id ? ' — ' + staffName(e.staff_id) : ''}`
      }
      return row
    })
    const armLabel = arms?.find((a) => a.id === armId)?.label ?? ''
    const header = docHeaderHtml({
      name: activeSchool?.name ?? 'School',
      address: activeSchool?.address,
      logoUrl: activeSchool?.logo_url,
      title: 'Class Timetable',
      subtitle: armLabel,
    })
    const table = tableHtml(
      [
        { key: 'period', label: 'Period' },
        { key: 'time', label: 'Time', align: 'center' as const },
        ...DAYS.map((d) => ({ key: `d${d.n}`, label: d.label, align: 'center' as const })),
      ],
      rows,
    )
    printHtml('Class Timetable', header + table)
  }

  return (
    <div>
      <PageHeader title="Timetable" description="Build a weekly timetable for each class. Adjust the periods per day, and label a slot Break/Assembly instead of a subject." />

      <Card className="mb-4">
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-foreground">Class</label>
            <Select value={armId} onChange={(e) => setArmId(e.target.value)} className="sm:max-w-xs">
              <option value="">Select a class…</option>
              {(arms ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </Select>
          </div>
          {canManage && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Periods / day</label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPeriods.mutate(periodCount - 1)}
                  disabled={periodCount <= 1 || setPeriods.isPending}
                  aria-label="Remove a period"
                >
                  −
                </Button>
                <span className="w-6 text-center font-medium tabular-nums text-foreground">{periodCount}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPeriods.mutate(periodCount + 1)}
                  disabled={periodCount >= 15 || setPeriods.isPending}
                  aria-label="Add a period"
                >
                  +
                </Button>
              </div>
            </div>
          )}
          {armId && (
            <Button variant="outline" onClick={exportTimetable}>
              <Printer className="h-4 w-4" /> Export / Print
            </Button>
          )}
        </CardBody>
      </Card>

      {!armId ? (
        <Card><CardBody className="py-12 text-center text-sm text-muted">Select a class to view its timetable.</CardBody></Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-16 border-b border-border px-2 py-2 text-left text-xs uppercase tracking-wider text-faint">Period</th>
                  {DAYS.map((d) => (
                    <th key={d.n} className="border-b border-l border-border px-2 py-2 text-center text-xs uppercase tracking-wider text-faint">{d.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map((p) => (
                  <tr key={p}>
                    <td className="border-b border-border px-2 py-2 text-center font-mono text-xs text-muted">{p}</td>
                    {DAYS.map((d) => {
                      const e = entries?.get(`${d.n}:${p}`)
                      return (
                        <td key={d.n} className="border-b border-l border-border p-1">
                          {(() => {
                            const isBreak = e && e.note && !e.subject_id
                            return (
                              <button
                                disabled={!canManage}
                                onClick={() => setCell({ day: d.n, period: p })}
                                className={`flex h-14 w-full flex-col items-center justify-center rounded-md px-1 text-center transition-colors ${
                                  isBreak
                                    ? 'bg-muted-surface text-muted hover:bg-border'
                                    : e
                                      ? 'bg-primary/10 text-primary hover:bg-primary/15'
                                      : 'text-faint hover:bg-muted-surface'
                                } ${!canManage ? 'cursor-default' : ''}`}
                              >
                                {e ? (
                                  isBreak ? (
                                    <span className="text-xs font-semibold uppercase tracking-wide leading-tight">{e.note}</span>
                                  ) : (
                                    <>
                                      <span className="text-xs font-medium leading-tight">{subjectName(e.subject_id) || e.note || 'Subject'}</span>
                                      {e.staff_id && <span className="text-[10px] text-muted">{staffName(e.staff_id)}</span>}
                                      {e.start_time && <span className="text-[10px] text-faint">{e.start_time}</span>}
                                    </>
                                  )
                                ) : canManage ? (
                                  <span className="text-lg">+</span>
                                ) : (
                                  <span className="text-xs">—</span>
                                )}
                              </button>
                            )
                          })()}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {cell && armId && (
        <CellDialog
          schoolId={schoolId}
          armId={armId}
          day={cell.day}
          period={cell.period}
          entry={entries?.get(`${cell.day}:${cell.period}`) ?? null}
          subjects={subjects ?? []}
          staff={staff ?? []}
          onClose={() => setCell(null)}
          onSaved={() => {
            setCell(null)
            qc.invalidateQueries({ queryKey: ['timetable', armId] })
          }}
        />
      )}
    </div>
  )
}

function CellDialog({
  schoolId,
  armId,
  day,
  period,
  entry,
  subjects,
  staff,
  onClose,
  onSaved,
}: {
  schoolId: string
  armId: string
  day: number
  period: number
  entry: Entry | null
  subjects: { id: string; name: string }[]
  staff: { id: string; first_name: string; last_name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [subjectId, setSubjectId] = useState(entry?.subject_id ?? '')
  const [staffId, setStaffId] = useState(entry?.staff_id ?? '')
  const [start, setStart] = useState(entry?.start_time ?? '')
  const [end, setEnd] = useState(entry?.end_time ?? '')
  const [note, setNote] = useState(entry?.note ?? '')

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('timetable_entries').upsert(
        {
          school_id: schoolId,
          class_arm_id: armId,
          day_of_week: day,
          period,
          subject_id: subjectId || null,
          staff_id: staffId || null,
          start_time: start || null,
          end_time: end || null,
          note: note.trim() || null,
        },
        { onConflict: 'class_arm_id,day_of_week,period' },
      )
      if (error) throw error
    },
    onSuccess: onSaved,
  })

  const clear = useMutation({
    mutationFn: async () => {
      if (entry) {
        const { error } = await supabase.from('timetable_entries').delete().eq('id', entry.id)
        if (error) throw error
      }
    },
    onSuccess: onSaved,
  })

  const dayLabel = DAYS.find((d) => d.n === day)?.label ?? ''

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${dayLabel} · Period ${period}`}
      footer={
        <>
          {entry && (
            <Button variant="ghost" onClick={() => clear.mutate()} loading={clear.isPending} className="mr-auto text-danger">
              Clear
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>Save</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Label / activity" htmlFor="tt-note" hint="For a non-teaching slot like Break, Assembly or Games — leave the subject empty.">
          <Input id="tt-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Break" />
        </Field>
        <Field label="Subject" htmlFor="tt-subject" hint="For a lesson. Leave empty if this is a Break/activity above.">
          <Select id="tt-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">—</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Teacher" htmlFor="tt-staff">
          <Select id="tt-staff" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">—</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start time" htmlFor="tt-start">
            <Input id="tt-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="End time" htmlFor="tt-end">
            <Input id="tt-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
      </div>
    </Dialog>
  )
}
