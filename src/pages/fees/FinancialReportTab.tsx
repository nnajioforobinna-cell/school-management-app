import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSchool } from '@/providers/SchoolProvider'
import { docHeaderHtml, printHtml, tableHtml, type Column } from '@/lib/print'
import { exportSheet } from '@/lib/excel'
import { formatMoney, cn } from '@/lib/utils'
import { Card, CardBody } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { ExportButtons } from '@/components/ExportButtons'

const TERM_LABEL: Record<string, string> = { first: 'First Term', second: 'Second Term', third: 'Third Term' }

interface Line {
  label: string
  amount: number
}
interface ReportData {
  fees: Line[]
  arrears: Line[]
  otherIncome: Line[]
  expenses: Line[]
  totalFees: number
  totalArrears: number
  totalOther: number
  totalIncome: number
  totalExpense: number
  net: number
}

export function FinancialReportTab() {
  const { activeSchool } = useSchool()
  const schoolId = activeSchool!.id
  const currency = activeSchool!.currency

  const [sessionId, setSessionId] = useState('')
  const [termId, setTermId] = useState('') // '' = whole session

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
    queryKey: ['financial_report', schoolId, sessionId, termId],
    enabled: !!sessionId,
    queryFn: async (): Promise<ReportData> => {
      // --- Fee income (CASH BASIS): payments COLLECTED in this period, split
      //     into current-period fees and arrears recovered from earlier periods. ---
      let payQ = supabase
        .from('payments')
        .select('amount, allocation, invoices(session_id, term_id, academic_sessions(name), terms(name))')
        .eq('school_id', schoolId)
        .eq('collected_session_id', sessionId)
      if (termId) payQ = payQ.eq('collected_term_id', termId)
      const [{ data: pays }, { data: feeStructs }] = await Promise.all([
        payQ,
        supabase.from('fee_structures').select('id, name').eq('school_id', schoolId),
      ])
      const feeName = new Map((feeStructs ?? []).map((f) => [f.id as string, f.name as string]))
      const labelForKey = (k: string) => feeName.get(k) ?? (k.startsWith('desc:') ? k.slice(5) : 'Fees')

      const feeMap = new Map<string, number>()
      const arrearsMap = new Map<string, number>()
      let unallocatedCurrent = 0
      let unallocatedArrears = 0
      for (const p of pays ?? []) {
        const inv = p.invoices as unknown as { session_id: string; term_id: string | null; academic_sessions: { name: string } | null; terms: { name: string } | null } | null
        const isCurrent = termId ? inv?.session_id === sessionId && inv?.term_id === termId : inv?.session_id === sessionId
        const periodLabel = `${inv?.academic_sessions?.name ?? ''} ${TERM_LABEL[inv?.terms?.name ?? ''] ?? inv?.terms?.name ?? ''}`.trim()
        const a = (p.allocation ?? null) as Record<string, number> | null
        if (a && Object.keys(a).length) {
          for (const [k, v] of Object.entries(a)) {
            if (isCurrent) feeMap.set(labelForKey(k), (feeMap.get(labelForKey(k)) ?? 0) + Number(v))
            else {
              const label = `${labelForKey(k)} (${periodLabel})`
              arrearsMap.set(label, (arrearsMap.get(label) ?? 0) + Number(v))
            }
          }
        } else if (isCurrent) {
          unallocatedCurrent += Number(p.amount)
        } else {
          unallocatedArrears += Number(p.amount)
        }
      }
      const fees: Line[] = [...feeMap.entries()].map(([label, amount]) => ({ label, amount })).filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount)
      if (unallocatedCurrent > 0) fees.push({ label: 'Fees (unallocated)', amount: unallocatedCurrent })
      const arrears: Line[] = [...arrearsMap.entries()].map(([label, amount]) => ({ label, amount })).filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount)
      if (unallocatedArrears > 0) arrears.push({ label: 'Arrears recovered (unallocated)', amount: unallocatedArrears })

      // --- Ledger income & expenses by category ---
      let ledQuery = supabase
        .from('ledger_entries')
        .select('kind, amount, category_id')
        .eq('school_id', schoolId)
        .eq('session_id', sessionId)
      if (termId) ledQuery = ledQuery.eq('term_id', termId)
      const [{ data: ledger }, { data: cats }] = await Promise.all([
        ledQuery,
        supabase.from('ledger_categories').select('id, name').eq('school_id', schoolId),
      ])
      const catName = new Map((cats ?? []).map((c) => [c.id as string, c.name as string]))

      const incMap = new Map<string, number>()
      const expMap = new Map<string, number>()
      for (const e of ledger ?? []) {
        const label = catName.get(e.category_id as string) ?? 'Uncategorised'
        const map = e.kind === 'income' ? incMap : expMap
        map.set(label, (map.get(label) ?? 0) + Number(e.amount))
      }
      const otherIncome: Line[] = [...incMap.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount)
      const expenses: Line[] = [...expMap.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount)

      const totalFees = fees.reduce((s, l) => s + l.amount, 0)
      const totalArrears = arrears.reduce((s, l) => s + l.amount, 0)
      const totalOther = otherIncome.reduce((s, l) => s + l.amount, 0)
      const totalIncome = totalFees + totalArrears + totalOther
      const totalExpense = expenses.reduce((s, l) => s + l.amount, 0)
      return { fees, arrears, otherIncome, expenses, totalFees, totalArrears, totalOther, totalIncome, totalExpense, net: totalIncome - totalExpense }
    },
  })

  const sessionName = sessions?.find((s) => s.id === sessionId)?.name ?? ''
  const scopeLabel = termId ? `${TERM_LABEL[terms?.find((t) => t.id === termId)?.name ?? ''] ?? ''} · ${sessionName}` : `Full session · ${sessionName}`

  const exportCols: Column[] = [
    { key: 'item', label: 'Item' },
    { key: 'amount', label: `Amount (${currency})`, align: 'right' },
  ]
  const reportRows = (formatted: boolean) => {
    if (!report) return [] as Record<string, unknown>[]
    const money = (n: number) => (formatted ? formatMoney(n, currency) : n)
    const rows: Record<string, unknown>[] = []
    rows.push({ item: 'INCOME', amount: '' })
    for (const l of report.fees) rows.push({ item: `  ${l.label} (fees)`, amount: money(l.amount) })
    for (const l of report.arrears) rows.push({ item: `  Arrears recovered — ${l.label}`, amount: money(l.amount) })
    for (const l of report.otherIncome) rows.push({ item: `  ${l.label}`, amount: money(l.amount) })
    rows.push({ item: 'Total income', amount: money(report.totalIncome) })
    rows.push({ item: '', amount: '' })
    rows.push({ item: 'EXPENSES', amount: '' })
    for (const l of report.expenses) rows.push({ item: `  ${l.label}`, amount: money(l.amount) })
    rows.push({ item: 'Total expenses', amount: money(report.totalExpense) })
    rows.push({ item: '', amount: '' })
    rows.push({ item: 'NET (SURPLUS / DEFICIT)', amount: money(report.net) })
    return rows
  }
  const exportPdf = () => {
    const header = docHeaderHtml({
      name: activeSchool?.name ?? 'School',
      address: activeSchool?.address,
      logoUrl: activeSchool?.logo_url,
      title: 'Income & Expenditure Statement',
      subtitle: scopeLabel,
    })
    printHtml('Income & Expenditure', header + tableHtml(exportCols, reportRows(true)))
  }
  const exportXlsx = () => exportSheet(`Financial Report ${sessionName}`, exportCols, reportRows(false), 'Income & Expenditure', 'Income & Expenditure')

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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Section title="Income" total={report.totalIncome} tone="text-success" currency={currency}>
              {report.fees.length > 0 && <SubHeader label="Fees collected (this period)" />}
              {report.fees.map((l) => <Row key={`f-${l.label}`} label={l.label} amount={l.amount} currency={currency} />)}
              {report.arrears.length > 0 && <SubHeader label="Arrears recovered (earlier periods)" />}
              {report.arrears.map((l) => <Row key={`a-${l.label}`} label={l.label} amount={l.amount} currency={currency} />)}
              {report.otherIncome.length > 0 && <SubHeader label="Other income" />}
              {report.otherIncome.map((l) => <Row key={`i-${l.label}`} label={l.label} amount={l.amount} currency={currency} />)}
              {report.fees.length === 0 && report.arrears.length === 0 && report.otherIncome.length === 0 && <Empty />}
            </Section>

            <Section title="Expenses" total={report.totalExpense} tone="text-danger" currency={currency}>
              {report.expenses.map((l) => <Row key={`e-${l.label}`} label={l.label} amount={l.amount} currency={currency} />)}
              {report.expenses.length === 0 && <Empty />}
            </Section>
          </div>

          <Card className="mt-4">
            <CardBody className="flex items-center justify-between">
              <span className="font-serif text-lg font-semibold text-foreground">Net {report.net >= 0 ? 'surplus' : 'deficit'}</span>
              <span className={cn('font-serif text-xl font-bold tabular-nums', report.net >= 0 ? 'text-success' : 'text-danger')}>
                {formatMoney(report.net, currency)}
              </span>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}

function Section({ title, total, tone, currency, children }: { title: string; total: number; tone: string; currency: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="font-serif text-base font-semibold text-foreground">{title}</h3>
        <span className={cn('font-semibold tabular-nums', tone)}>{formatMoney(total, currency)}</span>
      </div>
      <div className="px-5 py-2">{children}</div>
    </Card>
  )
}
function SubHeader({ label }: { label: string }) {
  return <p className="mt-2 mb-1 text-xs font-medium uppercase tracking-wider text-faint">{label}</p>
}
function Row({ label, amount, currency }: { label: string; amount: number; currency: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
      <span className="text-foreground">{label}</span>
      <span className="tabular-nums text-foreground">{formatMoney(amount, currency)}</span>
    </div>
  )
}
function Empty() {
  return <p className="py-3 text-sm text-muted">Nothing recorded for this period.</p>
}
