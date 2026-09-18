import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, NotebookPen, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSchool } from '@/providers/SchoolProvider'
import { useSync } from '@/providers/SyncProvider'
import { docHeaderHtml, printHtml, tableHtml, type Column } from '@/lib/print'
import { exportSheet } from '@/lib/excel'
import { ExportButtons } from '@/components/ExportButtons'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CA_MAX, CA_NAME, EXAM_MAX, EXAM_NAME, gradeFor } from '@/lib/grading'
import { cn } from '@/lib/utils'

interface Row {
  studentId: string
  name: string
  admissionNo: string | null
}
interface GradebookData {
  caId: string
  examId: string
  rows: Row[]
  scores: Record<string, { ca: number | null; exam: number | null }>
}

export function GradebookPage() {
  const { activeSchool } = useSchool()
  const { pushOrQueue } = useSync()
  const schoolId = activeSchool?.id
  const [armId, setArmId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [ca, setCa] = useState<Record<string, string>>({})
  const [exam, setExam] = useState<Record<string, string>>({})
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const { data: currentSession } = useQuery({
    queryKey: ['current_session', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from('academic_sessions')
        .select('*')
        .eq('school_id', schoolId!)
        .eq('is_current', true)
        .maybeSingle()
      return data
    },
  })

  const { data: currentTerm } = useQuery({
    queryKey: ['current_term', currentSession?.id],
    enabled: !!currentSession,
    queryFn: async () => {
      const { data } = await supabase
        .from('terms')
        .select('*')
        .eq('session_id', currentSession!.id)
        .eq('is_current', true)
        .maybeSingle()
      return data
    },
  })

  const { data: arms } = useQuery({
    queryKey: ['class_options', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from('class_arms')
        .select('id, name, class_levels(name, sort_order)')
        .eq('school_id', schoolId!)
      return (data ?? [])
        .map((a) => {
          const level = a.class_levels as unknown as { name: string; sort_order: number } | null
          return { id: a.id as string, label: `${level?.name ?? '—'} ${a.name}` }
        })
        .sort((x, y) => x.label.localeCompare(y.label))
    },
  })

  const { data: subjects } = useQuery({
    queryKey: ['subjects', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase.from('subjects').select('id, name').eq('school_id', schoolId!).order('name')
      return (data ?? []) as { id: string; name: string }[]
    },
  })

  const ready = !!schoolId && !!armId && !!subjectId && !!currentSession && !!currentTerm

  const { data, isFetching } = useQuery({
    queryKey: ['gradebook', schoolId, armId, subjectId, currentTerm?.id],
    enabled: ready,
    queryFn: async (): Promise<GradebookData> => {
      const termId = currentTerm!.id
      // Get or create the CA and Exam assessments for this subject/class/term.
      const { data: existing, error: aErr } = await supabase
        .from('assessments')
        .select('id, name')
        .eq('school_id', schoolId!)
        .eq('subject_id', subjectId)
        .eq('class_arm_id', armId)
        .eq('term_id', termId)
        .in('name', [CA_NAME, EXAM_NAME])
      if (aErr) throw aErr

      let caId = existing?.find((a) => a.name === CA_NAME)?.id as string | undefined
      let examId = existing?.find((a) => a.name === EXAM_NAME)?.id as string | undefined

      const toCreate = []
      if (!caId) toCreate.push({ school_id: schoolId!, subject_id: subjectId, class_arm_id: armId, term_id: termId, name: CA_NAME, max_score: CA_MAX })
      if (!examId) toCreate.push({ school_id: schoolId!, subject_id: subjectId, class_arm_id: armId, term_id: termId, name: EXAM_NAME, max_score: EXAM_MAX })
      if (toCreate.length) {
        const { data: created, error: cErr } = await supabase.from('assessments').insert(toCreate).select('id, name')
        if (cErr) throw cErr
        caId = caId ?? (created?.find((a) => a.name === CA_NAME)?.id as string)
        examId = examId ?? (created?.find((a) => a.name === EXAM_NAME)?.id as string)
      }

      // Enrolled students for this class in the current session.
      const { data: enr, error: eErr } = await supabase
        .from('enrollments')
        .select('student_id, students(first_name, last_name, admission_no)')
        .eq('school_id', schoolId!)
        .eq('class_arm_id', armId)
        .eq('session_id', currentSession!.id)
      if (eErr) throw eErr
      const allRows: Row[] = (enr ?? [])
        .map((r) => {
          const s = r.students as unknown as { first_name: string; last_name: string; admission_no: string | null } | null
          return {
            studentId: r.student_id as string,
            name: s ? `${s.last_name}, ${s.first_name}` : '',
            admissionNo: s?.admission_no ?? null,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      // Show only students who offer this subject. A student with no subject
      // selections for the session takes all subjects (safe default).
      const studentIds = allRows.map((r) => r.studentId)
      const offered = new Map<string, Set<string>>()
      if (studentIds.length) {
        const { data: ss } = await supabase
          .from('student_subjects')
          .select('student_id, subject_id')
          .eq('school_id', schoolId!)
          .eq('session_id', currentSession!.id)
          .in('student_id', studentIds)
        for (const r of ss ?? []) {
          const set = offered.get(r.student_id as string) ?? new Set<string>()
          set.add(r.subject_id as string)
          offered.set(r.student_id as string, set)
        }
      }
      const rows = allRows.filter((r) => {
        const set = offered.get(r.studentId)
        return !set || set.has(subjectId)
      })

      // Existing scores.
      const { data: sc, error: sErr } = await supabase
        .from('scores')
        .select('assessment_id, student_id, score')
        .in('assessment_id', [caId!, examId!])
      if (sErr) throw sErr
      const scores: Record<string, { ca: number | null; exam: number | null }> = {}
      for (const r of rows) scores[r.studentId] = { ca: null, exam: null }
      for (const s of sc ?? []) {
        const bucket = scores[s.student_id as string] ?? { ca: null, exam: null }
        if (s.assessment_id === caId) bucket.ca = s.score as number | null
        else if (s.assessment_id === examId) bucket.exam = s.score as number | null
        scores[s.student_id as string] = bucket
      }

      return { caId: caId!, examId: examId!, rows, scores }
    },
  })

  // Initialise editable inputs from loaded scores.
  useEffect(() => {
    if (!data) return
    const c: Record<string, string> = {}
    const e: Record<string, string> = {}
    for (const r of data.rows) {
      c[r.studentId] = data.scores[r.studentId]?.ca?.toString() ?? ''
      e[r.studentId] = data.scores[r.studentId]?.exam?.toString() ?? ''
    }
    setCa(c)
    setExam(e)
  }, [data])

  const clamp = (v: string, max: number) => {
    if (v === '') return ''
    const n = Math.max(0, Math.min(max, Number(v)))
    return Number.isNaN(n) ? '' : String(n)
  }

  const save = useMutation({
    mutationFn: async (): Promise<'synced' | 'queued' | 'empty'> => {
      if (!data || !schoolId) return 'empty'
      const rows: { school_id: string; assessment_id: string; student_id: string; score: number }[] = []
      for (const r of data.rows) {
        if (ca[r.studentId] !== '' && ca[r.studentId] != null)
          rows.push({ school_id: schoolId, assessment_id: data.caId, student_id: r.studentId, score: Number(ca[r.studentId]) })
        if (exam[r.studentId] !== '' && exam[r.studentId] != null)
          rows.push({ school_id: schoolId, assessment_id: data.examId, student_id: r.studentId, score: Number(exam[r.studentId]) })
      }
      if (!rows.length) return 'empty'
      return pushOrQueue({ table: 'scores', rows, onConflict: 'assessment_id,student_id', label: 'Scores' })
    },
    onSuccess: (result) => {
      if (result === 'empty') return
      setSavedMsg(result === 'queued' ? 'Saved offline — will sync' : 'Saved')
      setTimeout(() => setSavedMsg(null), 3000)
    },
  })

  const totals = useMemo(() => {
    if (!data) return { entered: 0, avg: 0 }
    let sum = 0
    let n = 0
    for (const r of data.rows) {
      const c = ca[r.studentId]
      const e = exam[r.studentId]
      if (c !== '' || e !== '') {
        sum += (Number(c) || 0) + (Number(e) || 0)
        n++
      }
    }
    return { entered: n, avg: n ? Math.round((sum / n) * 10) / 10 : 0 }
  }, [data, ca, exam])

  const exportCols: Column[] = [
    { key: 'adm', label: 'Adm. No.' },
    { key: 'name', label: 'Student' },
    { key: 'ca', label: `C.A. (${CA_MAX})`, align: 'center' },
    { key: 'exam', label: `Exam (${EXAM_MAX})`, align: 'center' },
    { key: 'total', label: 'Total', align: 'center' },
    { key: 'grade', label: 'Grade', align: 'center' },
  ]
  const exportRows = () =>
    (data?.rows ?? []).map((r) => {
      const c = ca[r.studentId] ?? ''
      const e = exam[r.studentId] ?? ''
      const has = c !== '' || e !== ''
      const total = (Number(c) || 0) + (Number(e) || 0)
      return {
        name: r.name,
        adm: r.admissionNo ?? '—',
        ca: c === '' ? '—' : c,
        exam: e === '' ? '—' : e,
        total: has ? total : '—',
        grade: has ? gradeFor(total).grade : '—',
      }
    })
  const subjectLabel = () => {
    const armLabel = arms?.find((a) => a.id === armId)?.label ?? ''
    const subjectName = subjects?.find((s) => s.id === subjectId)?.name ?? ''
    return `${armLabel} · ${subjectName} · ${currentTerm?.name ?? ''} term ${currentSession?.name ?? ''}`
  }
  const exportPdf = () => {
    if (!data) return
    const header = docHeaderHtml({
      name: activeSchool?.name ?? 'School',
      address: activeSchool?.address,
      logoUrl: activeSchool?.logo_url,
      title: 'Gradebook',
      subtitle: subjectLabel(),
    })
    printHtml('Gradebook', header + tableHtml(exportCols, exportRows()))
  }
  const exportXlsx = () => {
    if (!data) return
    exportSheet('Gradebook', exportCols, exportRows(), 'Gradebook', 'Gradebook')
  }

  return (
    <div>
      <PageHeader
        title="Gradebook"
        description={`Enter C.A. (/${CA_MAX}) and Exam (/${EXAM_MAX}) scores. Totals and grades compute automatically.`}
      />

      {!currentSession || !currentTerm ? (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Set a current session <em>and</em> term in <span className="font-medium">Settings → Academics</span> to
          enter scores.
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted">
          Recording for <span className="font-medium text-foreground">{currentTerm.name} term</span>,{' '}
          {currentSession.name}.
        </p>
      )}

      <Card className="mb-4">
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Class</label>
            <Select value={armId} onChange={(e) => setArmId(e.target.value)} disabled={!currentTerm}>
              <option value="">Select a class…</option>
              {(arms ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Subject</label>
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!currentTerm}>
              <option value="">Select a subject…</option>
              {(subjects ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      {!ready ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-muted">
            <NotebookPen className="mx-auto mb-3 h-8 w-8 text-faint" />
            Choose a class and subject above — then type each student's C.A. and Exam scores directly in the table.
          </CardBody>
        </Card>
      ) : isFetching && !data ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-muted">Loading…</CardBody>
        </Card>
      ) : !data || data.rows.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-muted">
            No students are enrolled in this class for the current session.
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <p className="text-sm text-muted">
              {totals.entered} of {data.rows.length} entered · class average{' '}
              <span className="font-semibold tabular-nums text-foreground">{totals.avg}</span>
            </p>
            <div className="ml-auto flex items-center gap-3">
              {savedMsg && (
                <span className="flex items-center gap-1 text-sm text-success">
                  <Check className="h-4 w-4" /> {savedMsg}
                </span>
              )}
              <ExportButtons onPdf={exportPdf} onExcel={exportXlsx} />
              <Button onClick={() => save.mutate()} loading={save.isPending}>
                <Save className="h-4 w-4" /> Save scores
              </Button>
            </div>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-faint">
                    <th className="px-5 py-3 font-medium">Student</th>
                    <th className="px-3 py-3 text-center font-medium">C.A. ({CA_MAX})</th>
                    <th className="px-3 py-3 text-center font-medium">Exam ({EXAM_MAX})</th>
                    <th className="px-3 py-3 text-center font-medium">Total</th>
                    <th className="px-3 py-3 text-center font-medium">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const c = ca[r.studentId] ?? ''
                    const e = exam[r.studentId] ?? ''
                    const hasAny = c !== '' || e !== ''
                    const total = (Number(c) || 0) + (Number(e) || 0)
                    const band = hasAny ? gradeFor(total) : null
                    return (
                      <tr key={r.studentId} className="border-b border-border last:border-0">
                        <td className="px-5 py-2.5">
                          <p className="font-medium text-foreground">{r.name}</p>
                          {r.admissionNo && <p className="font-mono text-xs text-muted">{r.admissionNo}</p>}
                        </td>
                        <td className="px-3 py-2.5">
                          <Input
                            type="number"
                            min={0}
                            max={CA_MAX}
                            value={c}
                            onChange={(ev) => setCa((m) => ({ ...m, [r.studentId]: clamp(ev.target.value, CA_MAX) }))}
                            className="mx-auto h-9 w-20 text-center tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <Input
                            type="number"
                            min={0}
                            max={EXAM_MAX}
                            value={e}
                            onChange={(ev) => setExam((m) => ({ ...m, [r.studentId]: clamp(ev.target.value, EXAM_MAX) }))}
                            className="mx-auto h-9 w-20 text-center tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center font-semibold tabular-nums text-foreground">
                          {hasAny ? total : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {band ? (
                            <span
                              className={cn(
                                'font-mono text-sm font-medium',
                                band.grade === 'F' ? 'text-danger' : 'text-primary',
                              )}
                              title={band.remark}
                            >
                              {band.grade}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
