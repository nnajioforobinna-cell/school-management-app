import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSchool } from '@/providers/SchoolProvider'
import { docHeaderHtml, printHtml, tableHtml, type Column } from '@/lib/print'
import { exportSheets } from '@/lib/excel'
import { formatMoney, cn } from '@/lib/utils'
import { Card, CardBody } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ExportButtons } from '@/components/ExportButtons'

const TERM_LABEL: Record<string, string> = { first: 'First Term', second: 'Second Term', third: 'Third Term' }

interface ClassRow {
  armId: string
  label: string
  sort: number
  billed: number
  collected: number
  outstanding: number
  debtors: number
}
interface Debtor {
  studentId: string
  name: string
  admissionNo: string | null
  className: string
  outstanding: number
}
interface FeeRow {
  label: string
  outstanding: number
}
interface Report {
  byClass: ClassRow[]
  byFee: FeeRow[]
  debtors: Debtor[]
  billed: number
  collected: number
  outstanding: number
}

export function OutstandingTab() {
  const { activeSchool } = useSchool()
  const schoolId = activeSchool!.id
  const currency = activeSchool!.currency

  const [sessionId, setSessionId] = useState('')
  const [termId, setTermId] = useState('')
  const [search, setSearch] = useState('')

  const { data: sessions } = useQuery({
    queryKey: ['academic_sessions', schoolId],
    queryFn: async () => {
      const { data } = await supabase.from('academic_sessions').select('id, name, is_current').eq('school_id', schoolId).order('name', { ascending: false })
      return (data ?? []) as { id: string; name: string; is_current: boolean }[]
    },
  })
  useEffect(() => {
    if (!sessionId && sessions && sessions.length) setSessionId((sessions.find((s) => s.is_current) ?? sessions[0]).id)
  }, [sessions, sessionId])

  const { data: terms } = useQuery({
    queryKey: ['terms', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data } = await supabase.from('terms').select('id, name').eq('session_id', sessionId).order('name')
      return (data ?? []) as { id: string; name: string }[]
    },
  })

  const { data: report, isFetching } = useQuery({
    queryKey: ['outstanding', schoolId, sessionId, termId],
    enabled: !!sessionId,
    queryFn: async (): Promise<Report> => {
      let invQ = supabase.from('invoices').select('id, student_id, total, amount_paid').eq('school_id', schoolId).eq('session_id', sessionId)
      if (termId) invQ = invQ.eq('term_id', termId)
      const { data: invoices } = await invQ
      const invIds = (invoices ?? []).map((i) => i.id as string)
      const studentIds = [...new Set((invoices ?? []).map((i) => i.student_id as string))]

      // Class + name for each student, from the session's enrolment.
      const studentArm = new Map<string, string>()
      const armLabel = new Map<string, { label: string; sort: number }>()
      const studentInfo = new Map<string, { name: string; adm: string | null; className: string }>()
      if (studentIds.length) {
        const { data: enr } = await supabase
          .from('enrollments')
          .select('student_id, class_arm_id, class_arms(name, class_levels(name, sort_order)), students(first_name, last_name, admission_no)')
          .eq('school_id', schoolId)
          .eq('session_id', sessionId)
          .in('student_id', studentIds)
        for (const e of enr ?? []) {
          const arm = e.class_arms as unknown as { name: string; class_levels: { name: string; sort_order: number } | null } | null
          const label = `${arm?.class_levels?.name ?? '—'} ${arm?.name ?? ''}`.trim()
          studentArm.set(e.student_id as string, e.class_arm_id as string)
          armLabel.set(e.class_arm_id as string, { label, sort: arm?.class_levels?.sort_order ?? 0 })
          const s = e.students as unknown as { first_name: string; last_name: string; admission_no: string | null } | null
          studentInfo.set(e.student_id as string, { name: s ? `${s.last_name}, ${s.first_name}` : '', adm: s?.admission_no ?? null, className: label })
        }
      }

      // Totals + by-class + per-student outstanding.
      const byClass = new Map<string, ClassRow>()
      const outByStudent = new Map<string, number>()
      let billed = 0
      let collected = 0
      let outstanding = 0
      for (const i of invoices ?? []) {
        const total = Number(i.total)
        const paid = Number(i.amount_paid)
        const out = Math.max(0, total - paid)
        billed += total
        collected += paid
        outstanding += out
        outByStudent.set(i.student_id as string, (outByStudent.get(i.student_id as string) ?? 0) + out)
        const armId = studentArm.get(i.student_id as string) ?? 'unknown'
        const meta = armLabel.get(armId)
        const rec = byClass.get(armId) ?? { armId, label: meta?.label ?? 'Unassigned', sort: meta?.sort ?? 999, billed: 0, collected: 0, outstanding: 0, debtors: 0 }
        rec.billed += total
        rec.collected += paid
        rec.outstanding += out
        byClass.set(armId, rec)
      }
      // Debtor count per class.
      for (const [studentId, out] of outByStudent) {
        if (out > 0) {
          const armId = studentArm.get(studentId) ?? 'unknown'
          const rec = byClass.get(armId)
          if (rec) rec.debtors += 1
        }
      }

      // Outstanding by fee structure (billed per fee minus allocated payments).
      const billedByFee = new Map<string, { label: string; amount: number }>()
      const paidByFee = new Map<string, number>()
      if (invIds.length) {
        const [{ data: items }, { data: pays }] = await Promise.all([
          supabase.from('invoice_items').select('fee_structure_id, description, amount').in('invoice_id', invIds),
          supabase.from('payments').select('allocation').in('invoice_id', invIds),
        ])
        for (const it of items ?? []) {
          const key = (it.fee_structure_id as string) ?? `desc:${it.description}`
          const rec = billedByFee.get(key) ?? { label: it.description as string, amount: 0 }
          rec.amount += Number(it.amount)
          billedByFee.set(key, rec)
        }
        for (const p of pays ?? []) {
          const a = (p.allocation ?? {}) as Record<string, number>
          for (const [k, v] of Object.entries(a)) paidByFee.set(k, (paidByFee.get(k) ?? 0) + Number(v))
        }
      }
      const byFee: FeeRow[] = [...billedByFee.entries()]
        .map(([key, { label, amount }]) => ({ label, outstanding: Math.max(0, amount - (paidByFee.get(key) ?? 0)) }))
        .filter((f) => f.outstanding > 0)
        .sort((a, b) => b.outstanding - a.outstanding)

      const debtors: Debtor[] = [...outByStudent.entries()]
        .filter(([, out]) => out > 0)
        .map(([studentId, out]) => {
          const info = studentInfo.get(studentId)
          return { studentId, name: info?.name ?? '', admissionNo: info?.adm ?? null, className: info?.className ?? '', outstanding: out }
        })
        .sort((a, b) => b.outstanding - a.outstanding)

      return {
        byClass: [...byClass.values()].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label)),
        byFee,
        debtors,
        billed,
        collected,
        outstanding,
      }
    },
  })

  const sessionName = sessions?.find((s) => s.id === sessionId)?.name ?? ''
  const scopeLabel = termId ? `${TERM_LABEL[terms?.find((t) => t.id === termId)?.name ?? ''] ?? ''} · ${sessionName}` : `Full session · ${sessionName}`
  const rate = report && report.billed > 0 ? Math.round((report.collected / report.billed) * 100) : 0

  const filteredDebtors = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return report?.debtors ?? []
    return (report?.debtors ?? []).filter((d) => `${d.name} ${d.admissionNo ?? ''} ${d.className}`.toLowerCase().includes(q))
  }, [report, search])

  const classCols: Column[] = [
    { key: 'label', label: 'Class' },
    { key: 'billed', label: 'Billed', align: 'right' },
    { key: 'collected', label: 'Collected', align: 'right' },
    { key: 'outstanding', label: 'Outstanding', align: 'right' },
    { key: 'debtors', label: 'Debtors', align: 'center' },
  ]
  const debtorCols: Column[] = [
    { key: 'adm', label: 'Adm. No.' },
    { key: 'name', label: 'Student' },
    { key: 'className', label: 'Class' },
    { key: 'outstanding', label: 'Outstanding', align: 'right' },
  ]
  const classRows = (fmt: boolean) =>
    (report?.byClass ?? []).map((c) => ({
      label: c.label,
      billed: fmt ? formatMoney(c.billed, currency) : c.billed,
      collected: fmt ? formatMoney(c.collected, currency) : c.collected,
      outstanding: fmt ? formatMoney(c.outstanding, currency) : c.outstanding,
      debtors: c.debtors,
    }))
  const debtorRows = (fmt: boolean) =>
    filteredDebtors.map((d) => ({
      adm: d.admissionNo ?? '—',
      name: d.name,
      className: d.className,
      outstanding: fmt ? formatMoney(d.outstanding, currency) : d.outstanding,
    }))

  const exportPdf = () => {
    const header = docHeaderHtml({
      name: activeSchool?.name ?? 'School',
      address: activeSchool?.address,
      logoUrl: activeSchool?.logo_url,
      title: 'Outstanding Fees / Debt',
      subtitle: `${scopeLabel} · Outstanding ${formatMoney(report?.outstanding ?? 0, currency)}`,
    })
    const classTable = '<div class="doc-title">By class</div>' + tableHtml(classCols, classRows(true))
    const debtorTable = '<div class="doc-title">Debtor list</div>' + tableHtml(debtorCols, debtorRows(true))
    printHtml('Outstanding Fees', header + classTable + debtorTable)
  }
  const exportXlsx = () =>
    exportSheets(
      `Outstanding Fees ${sessionName}`,
      [
        { name: 'By class', columns: classCols, rows: classRows(false) },
        { name: 'Debtors', columns: debtorCols, rows: debtorRows(false) },
        { name: 'By fee', columns: [{ key: 'label', label: 'Fee' }, { key: 'outstanding', label: 'Outstanding', align: 'right' }], rows: (report?.byFee ?? []).map((f) => ({ label: f.label, outstanding: f.outstanding })) },
      ],
      'Outstanding Fees',
    )

  return (
    <div>
      <Card className="mb-4">
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Session</label>
            <Select value={sessionId} onChange={(e) => { setSessionId(e.target.value); setTermId('') }}>
              {(sessions ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.is_current ? ' (current)' : ''}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Period</label>
            <Select value={termId} onChange={(e) => setTermId(e.target.value)}>
              <option value="">Full session (annual)</option>
              {(terms ?? []).map((t) => (
                <option key={t.id} value={t.id}>{TERM_LABEL[t.name] ?? t.name}</option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      {isFetching && !report ? (
        <Card><CardBody className="py-12 text-center text-sm text-muted">Computing…</CardBody></Card>
      ) : !report ? null : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">{scopeLabel}</p>
            <ExportButtons onPdf={exportPdf} onExcel={exportXlsx} />
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Outstanding" value={formatMoney(report.outstanding, currency)} tone="text-danger" />
            <Stat label="Billed" value={formatMoney(report.billed, currency)} />
            <Stat label="Collected" value={formatMoney(report.collected, currency)} tone="text-success" />
            <Stat label="Collection rate" value={`${rate}%`} tone={rate >= 70 ? 'text-success' : 'text-warning'} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="border-b border-border px-5 py-3">
                <h3 className="font-serif text-base font-semibold text-foreground">By class</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-faint">
                      <th className="px-5 py-3 font-medium">Class</th>
                      <th className="px-4 py-3 text-right font-medium">Billed</th>
                      <th className="px-4 py-3 text-right font-medium">Collected</th>
                      <th className="px-4 py-3 text-right font-medium">Outstanding</th>
                      <th className="px-4 py-3 text-center font-medium">Debtors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byClass.map((c) => (
                      <tr key={c.armId} className="border-b border-border last:border-0">
                        <td className="px-5 py-2.5 font-medium text-foreground">{c.label}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted">{formatMoney(c.billed, currency)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-success">{formatMoney(c.collected, currency)}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums text-danger">{formatMoney(c.outstanding, currency)}</td>
                        <td className="px-4 py-2.5 text-center tabular-nums">{c.debtors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <div className="border-b border-border px-5 py-3">
                <h3 className="font-serif text-base font-semibold text-foreground">By fee</h3>
              </div>
              <div className="px-5 py-2">
                {report.byFee.length === 0 ? (
                  <p className="py-3 text-sm text-muted">Nothing outstanding.</p>
                ) : (
                  report.byFee.map((f) => (
                    <div key={f.label} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                      <span className="text-foreground">{f.label}</span>
                      <span className="tabular-nums text-danger">{formatMoney(f.outstanding, currency)}</span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <Card className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
              <h3 className="font-serif text-base font-semibold text-foreground">Debtors ({report.debtors.length})</h3>
              <div className="relative min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <Input className="pl-9" placeholder="Search debtor" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            {filteredDebtors.length === 0 ? (
              <CardBody className="py-10 text-center text-sm text-muted">
                {report.debtors.length === 0 ? 'No outstanding fees — everyone is fully paid.' : 'No debtors match your search.'}
              </CardBody>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-faint">
                      <th className="px-5 py-3 font-medium">Student</th>
                      <th className="px-4 py-3 font-medium">Class</th>
                      <th className="px-4 py-3 text-right font-medium">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDebtors.map((d) => (
                      <tr key={d.studentId} className="border-b border-border last:border-0">
                        <td className="px-5 py-2.5">
                          <p className="font-medium text-foreground">{d.name}</p>
                          {d.admissionNo && <p className="font-mono text-xs text-muted">{d.admissionNo}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-muted">{d.className}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums text-danger">{formatMoney(d.outstanding, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardBody className="py-3">
        <p className="text-xs uppercase tracking-wider text-faint">{label}</p>
        <p className={cn('mt-0.5 font-serif text-lg font-semibold tabular-nums', tone ?? 'text-foreground')}>{value}</p>
      </CardBody>
    </Card>
  )
}
