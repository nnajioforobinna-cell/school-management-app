import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSchool } from '@/providers/SchoolProvider'
import type { SchoolRow } from '@/types/database'
import { DEFAULT_BANDS, ordinal } from '@/lib/grading'
import { formatDate } from '@/lib/utils'
import { printNode } from '@/lib/print'
import type { StudentResult } from '@/lib/results'
import { Button } from '@/components/ui/button'

interface Props {
  school: SchoolRow
  sessionName: string
  termName: string
  resumptionDate: string | null
  classLabel: string
  noInClass: number
  enrollmentId: string
  termId: string
  student: StudentResult
}

export function ReportCard({
  school,
  sessionName,
  termName,
  resumptionDate,
  classLabel,
  noInClass,
  enrollmentId,
  termId,
  student,
}: Props) {
  const { activeRole } = useSchool()
  const qc = useQueryClient()
  const sheetRef = useRef<HTMLDivElement>(null)
  const canManage = activeRole === 'owner' || activeRole === 'admin' || activeRole === 'teacher'

  const { data: attendance } = useQuery({
    queryKey: ['report_attendance', enrollmentId, termId],
    queryFn: async () => {
      const { data } = await supabase
        .from('attendance')
        .select('status')
        .eq('enrollment_id', enrollmentId)
        .eq('term_id', termId)
      const c = { present: 0, absent: 0, total: 0 }
      for (const r of data ?? []) {
        c.total++
        if (r.status === 'present' || r.status === 'late') c.present++
        else if (r.status === 'absent') c.absent++
      }
      return c
    },
  })

  const { data: existing } = useQuery({
    queryKey: ['report_card', student.studentId, termId],
    queryFn: async () => {
      const { data } = await supabase
        .from('report_cards')
        .select('*')
        .eq('student_id', student.studentId)
        .eq('term_id', termId)
        .maybeSingle()
      return data
    },
  })

  const [teacherComment, setTeacherComment] = useState<string | null>(null)
  const [principalComment, setPrincipalComment] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const tc = teacherComment ?? existing?.class_teacher_comment ?? ''
  const pc = principalComment ?? existing?.principal_comment ?? ''

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const { error } = await supabase.from('report_cards').upsert(
        {
          school_id: school.id,
          student_id: student.studentId,
          term_id: termId,
          total_score: student.total,
          average: student.average,
          position: student.position,
          overall_grade: student.grade,
          class_teacher_comment: tc || null,
          principal_comment: pc || null,
          data: JSON.parse(JSON.stringify({ subjects: student.subjects, no_in_class: noInClass })),
          ...(publish ? { published_at: new Date().toISOString() } : {}),
        },
        { onConflict: 'student_id,term_id' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      qc.invalidateQueries({ queryKey: ['report_card', student.studentId, termId] })
    },
  })

  const fullName = `${student.firstName}${student.middleName ? ` ${student.middleName}` : ''} ${student.lastName}`
  const termLabel = { first: 'First Term', second: 'Second Term', third: 'Third Term' }[termName] ?? termName
  const showAttendance = ((school.settings ?? {}) as Record<string, unknown>).report_show_attendance !== false

  return (
    <div>
      {/* Toolbar (not printed) */}
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        {canManage && (
          <>
            <Button variant="outline" onClick={() => save.mutate(false)} loading={save.isPending}>
              Save comments
            </Button>
            <Button variant="outline" onClick={() => save.mutate(true)} loading={save.isPending}>
              Save &amp; publish
            </Button>
            {existing?.published_at && (
              <span className="text-xs text-success">Published</span>
            )}
            {saved && (
              <span className="flex items-center gap-1 text-sm text-success">
                <Check className="h-4 w-4" /> Saved
              </span>
            )}
          </>
        )}
        <Button className="ml-auto" onClick={() => sheetRef.current && printNode(sheetRef.current, 'Report Card', { fit: true })}>
          <Printer className="h-4 w-4" /> Print / Save PDF
        </Button>
      </div>

      {/* The sheet */}
      <div
        ref={sheetRef}
        className="report-sheet mx-auto max-w-[820px] border-t-4 bg-white p-8 text-[#1a2430] shadow-sm"
        style={{ borderTopColor: '#1e5a43' }}
      >
        {/* Masthead */}
        <div className="grid grid-cols-[64px_1fr_64px] items-center gap-4 border-b-2 pb-4" style={{ borderColor: '#1e5a43' }}>
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 font-serif text-xl font-bold" style={{ borderColor: '#1e5a43', color: '#1e5a43' }}>
            {school.logo_url ? <img src={school.logo_url} alt="" className="h-full w-full object-cover" /> : school.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="text-center">
            <h1 className="font-serif text-2xl font-bold" style={{ color: '#1e5a43' }}>
              {school.name}
            </h1>
            {school.address && <p className="mt-0.5 text-[11px] text-[#5a6672]">{school.address}</p>}
            {school.motto && <p className="font-serif text-xs italic" style={{ color: '#9c6f29' }}>{school.motto}</p>}
          </div>
          <div />
        </div>

        <p className="my-4 text-center font-mono text-xs uppercase tracking-[0.3em]">
          <span className="border-y border-[#d8deda] px-4 py-1.5">Terminal Report Sheet</span>
        </p>

        {/* Bio */}
        <div className="grid grid-cols-2 gap-px border border-[#d8deda] bg-[#d8deda] sm:grid-cols-4">
          <Bio label="Student" value={fullName} className="col-span-2" />
          <Bio label="Admission No." value={student.admissionNo ?? '—'} />
          <Bio label="Class" value={classLabel} />
          <Bio label="Session" value={sessionName} />
          <Bio label="Term" value={termLabel} />
          <Bio label="Gender" value={student.gender ?? '—'} />
          <Bio label="Position" value={`${ordinal(student.position)} of ${noInClass}`} />
        </div>
        {showAttendance ? (
          <div className="mb-5 flex border border-t-0 border-[#d8deda] text-sm">
            <Att label="Days Present" value={attendance?.present ?? 0} />
            <Att label="Days Absent" value={attendance?.absent ?? 0} />
            <Att label="Days Marked" value={attendance?.total ?? 0} />
          </div>
        ) : (
          <div className="mb-5" />
        )}

        {/* Subjects */}
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: '#1e5a43' }}>
          Academic Performance
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#ecf1ec] text-center font-mono text-[10px] uppercase tracking-wide text-[#5a6672]">
                <th className="border-b border-[#d8deda] px-3 py-2 text-left">Subject</th>
                <th className="border-b border-[#d8deda] px-2 py-2">C.A. (40)</th>
                <th className="border-b border-[#d8deda] px-2 py-2">Exam (60)</th>
                <th className="border-b border-[#d8deda] px-2 py-2">Total (100)</th>
                <th className="border-b border-[#d8deda] px-2 py-2">Grade</th>
                <th className="border-b border-[#d8deda] px-2 py-2">Remark</th>
              </tr>
            </thead>
            <tbody>
              {student.subjects.map((s, i) => (
                <tr key={s.subjectId} className={i % 2 ? 'bg-[#f6f8f5]' : ''}>
                  <td className="border-b border-[#eef1ec] px-3 py-1.5 font-medium">{s.name}</td>
                  <td className="border-b border-[#eef1ec] px-2 py-1.5 text-center tabular-nums">{s.ca ?? '—'}</td>
                  <td className="border-b border-[#eef1ec] px-2 py-1.5 text-center tabular-nums">{s.exam ?? '—'}</td>
                  <td className="border-b border-[#eef1ec] px-2 py-1.5 text-center font-semibold tabular-nums">{s.total ?? '—'}</td>
                  <td className="border-b border-[#eef1ec] px-2 py-1.5 text-center font-mono" style={{ color: s.grade === 'F' ? '#ae3a2b' : '#1e5a43' }}>
                    {s.grade ?? '—'}
                  </td>
                  <td className="border-b border-[#eef1ec] px-2 py-1.5 text-center text-[#5a6672]">{s.remark ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="mt-4 grid grid-cols-2 gap-px border border-[#d8deda] bg-[#d8deda] sm:grid-cols-4">
          <Summ label="Total" value={String(student.total)} />
          <Summ label="Average" value={`${student.average}%`} />
          <Summ label="Grade" value={student.grade} />
          <Summ label="Position" value={ordinal(student.position)} />
        </div>

        {/* Grading key */}
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[#5a6672]">
          {DEFAULT_BANDS.map((b) => (
            <span key={b.grade}>
              <span className="font-mono font-medium text-[#1a2430]">{b.grade}</span> {b.min}–{b.max} {b.remark}
            </span>
          ))}
        </div>

        {/* Comments */}
        <div className="mt-5 grid gap-3">
          <Comment label="Class Teacher's Remark" value={tc} editable={canManage} onChange={setTeacherComment} />
          <Comment label="Principal's Remark" value={pc} editable={canManage} onChange={setPrincipalComment} />
        </div>

        {resumptionDate && (
          <p className="mt-5 text-center text-[13px]">
            Next term begins <b style={{ color: '#1e5a43' }}>{formatDate(resumptionDate)}</b>.
          </p>
        )}

        {/* Signatures */}
        <div className="mt-8 grid grid-cols-3 gap-6 text-center">
          {['Class Teacher', 'Principal & Stamp', 'Parent / Guardian'].map((s) => (
            <div key={s}>
              <div className="mb-1 border-t border-[#1a2430]" />
              <span className="font-mono text-[10px] uppercase tracking-wide text-[#5a6672]">{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Bio({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`bg-white px-3 py-2 ${className}`}>
      <div className="font-mono text-[9px] uppercase tracking-wide text-[#8b95a0]">{label}</div>
      <div className="mt-0.5 text-[13px] font-medium">{value}</div>
    </div>
  )
}

function Att({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 border-r border-[#d8deda] px-3 py-2 last:border-r-0">
      <div className="font-mono text-[9px] uppercase tracking-wide text-[#8b95a0]">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function Summ({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#ecf1ec] px-3 py-2.5 text-center">
      <div className="font-mono text-[9px] uppercase tracking-wide text-[#5a6672]">{label}</div>
      <div className="mt-0.5 font-serif text-xl font-semibold" style={{ color: '#1e5a43' }}>
        {value}
      </div>
    </div>
  )
}

function Comment({
  label,
  value,
  editable,
  onChange,
}: {
  label: string
  value: string
  editable: boolean
  onChange: (v: string) => void
}) {
  return (
    <div className="border-l-[3px] bg-[#f6f8f5] px-4 py-2.5" style={{ borderColor: '#9c6f29' }}>
      <div className="mb-1 font-mono text-[9px] uppercase tracking-wide text-[#5a6672]">{label}</div>
      {editable ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          placeholder="Add a remark…"
          className="w-full resize-none bg-transparent font-serif text-sm italic text-[#1a2430] outline-none placeholder:text-[#8b95a0]"
        />
      ) : (
        <p className="font-serif text-sm italic">{value || '—'}</p>
      )}
    </div>
  )
}
