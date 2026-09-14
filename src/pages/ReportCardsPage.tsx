import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSchool } from '@/providers/SchoolProvider'
import { computeClassResults, type RawAssessment, type RawEnrollment, type RawScore } from '@/lib/results'
import { ordinal } from '@/lib/grading'
import { PageHeader } from '@/components/PageHeader'
import { ReportCard } from '@/components/ReportCard'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

const TERM_LABEL: Record<string, string> = { first: 'First Term', second: 'Second Term', third: 'Third Term' }

export function ReportCardsPage() {
  const { activeSchool } = useSchool()
  const schoolId = activeSchool?.id
  const [armId, setArmId] = useState('')
  const [termId, setTermId] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

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

  const { data: terms } = useQuery({
    queryKey: ['terms', currentSession?.id],
    enabled: !!currentSession,
    queryFn: async () => {
      const { data } = await supabase
        .from('terms')
        .select('*')
        .eq('session_id', currentSession!.id)
        .order('name')
      return data ?? []
    },
  })

  useEffect(() => {
    if (!termId && terms && terms.length) {
      setTermId((terms.find((t) => t.is_current) ?? terms[0]).id)
    }
  }, [terms, termId])

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

  const ready = !!schoolId && !!armId && !!termId && !!currentSession

  const { data: results, isFetching } = useQuery({
    queryKey: ['class_results', schoolId, armId, termId, currentSession?.id],
    enabled: ready,
    queryFn: async () => {
      const [{ data: enr }, { data: assess }] = await Promise.all([
        supabase
          .from('enrollments')
          .select('id, student_id, students(first_name, last_name, middle_name, admission_no, gender, photo_url)')
          .eq('school_id', schoolId!)
          .eq('class_arm_id', armId)
          .eq('session_id', currentSession!.id),
        supabase
          .from('assessments')
          .select('id, name, subject_id, subjects(name)')
          .eq('school_id', schoolId!)
          .eq('class_arm_id', armId)
          .eq('term_id', termId),
      ])

      const assessmentIds = (assess ?? []).map((a) => a.id)
      let scores: RawScore[] = []
      if (assessmentIds.length) {
        const { data: sc } = await supabase
          .from('scores')
          .select('assessment_id, student_id, score')
          .in('assessment_id', assessmentIds)
        scores = (sc ?? []) as RawScore[]
      }

      const enrollmentIdByStudent = new Map<string, string>()
      for (const e of enr ?? []) enrollmentIdByStudent.set(e.student_id as string, e.id as string)

      const students = computeClassResults(
        (enr ?? []) as unknown as RawEnrollment[],
        (assess ?? []) as unknown as RawAssessment[],
        scores,
      )
      return { students, enrollmentIdByStudent }
    },
  })

  const selectedTerm = terms?.find((t) => t.id === termId)
  const classLabel = arms?.find((a) => a.id === armId)?.label ?? ''
  const selectedStudent = results?.students.find((s) => s.studentId === selected)

  // Single report-card view.
  if (selectedStudent && activeSchool && selectedTerm && currentSession) {
    return (
      <div>
        <button
          onClick={() => setSelected(null)}
          className="no-print mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to class list
        </button>
        <ReportCard
          school={activeSchool}
          sessionName={currentSession.name}
          termName={selectedTerm.name}
          resumptionDate={selectedTerm.resumption_date}
          classLabel={classLabel}
          noInClass={results!.students.length}
          enrollmentId={results!.enrollmentIdByStudent.get(selectedStudent.studentId) ?? ''}
          termId={termId}
          student={selectedStudent}
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Report cards"
        description="Generate termly report sheets. Totals, grades and positions are computed from the gradebook."
      />

      {!currentSession || !terms?.length ? (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Set a current session and add terms in <span className="font-medium">Settings → Academics</span> first.
        </div>
      ) : null}

      <Card className="mb-4">
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Class</label>
            <Select value={armId} onChange={(e) => setArmId(e.target.value)}>
              <option value="">Select a class…</option>
              {(arms ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Term</label>
            <Select value={termId} onChange={(e) => setTermId(e.target.value)}>
              {(terms ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {TERM_LABEL[t.name] ?? t.name}
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      {!ready ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-muted">
            <FileText className="mx-auto mb-3 h-8 w-8 text-faint" />
            Choose a class and term to generate report cards.
          </CardBody>
        </Card>
      ) : isFetching && !results ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-muted">Computing results…</CardBody>
        </Card>
      ) : !results || results.students.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-muted">
            No students are enrolled in this class for the current session.
          </CardBody>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-faint">
                  <th className="px-5 py-3 font-medium">Pos.</th>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 text-center font-medium">Total</th>
                  <th className="px-5 py-3 text-center font-medium">Average</th>
                  <th className="px-5 py-3 text-center font-medium">Grade</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {results.students.map((s) => (
                  <tr key={s.studentId} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-mono text-xs text-muted">{ordinal(s.position)}</td>
                    <td className="px-5 py-3 font-medium text-foreground">
                      {s.lastName}, {s.firstName}
                    </td>
                    <td className="px-5 py-3 text-center tabular-nums">{s.total}</td>
                    <td className="px-5 py-3 text-center tabular-nums">{s.average}%</td>
                    <td className="px-5 py-3 text-center font-mono" style={{ color: s.grade === 'F' ? undefined : undefined }}>
                      {s.grade}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => setSelected(s.studentId)}>
                        View report
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
