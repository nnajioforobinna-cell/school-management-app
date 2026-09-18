import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Receipt, Plus, Pencil, Trash2, FileUp, Wand2, Check, Printer, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { useSchool } from '@/providers/SchoolProvider'
import { useSync } from '@/providers/SyncProvider'
import type { Tables } from '@/types/database'
import { docHeaderHtml, escapeHtml, printHtml, tableHtml, type Column } from '@/lib/print'
import { exportSheet } from '@/lib/excel'
import { ExportButtons } from '@/components/ExportButtons'
import { formatDate, formatMoney } from '@/lib/utils'
import { PageHeader } from '@/components/PageHeader'
import { LedgerTab } from '@/pages/fees/LedgerTab'
import { FinancialReportTab } from '@/pages/fees/FinancialReportTab'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

type FeeStructure = Tables<'fee_structures'>
const TERM_LABEL: Record<string, string> = { first: 'First Term', second: 'Second Term', third: 'Third Term' }

const TABS = [
  { id: 'invoices', label: 'Invoices & payments' },
  { id: 'structure', label: 'Fee structure' },
  { id: 'ledger', label: 'Accounts ledger' },
  { id: 'report', label: 'Financial report' },
] as const
type TabId = (typeof TABS)[number]['id']

export function FeesPage() {
  const { activeSchool } = useSchool()
  const [tab, setTab] = useState<TabId>('invoices')

  return (
    <div>
      <PageHeader
        title="Fees"
        description="Define fees, generate invoices, and record bank payments with receipts."
      />
      <div className="mb-4 flex gap-1">
        {TABS.map((t) => (
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
      {activeSchool && tab === 'invoices' && <InvoicesTab />}
      {activeSchool && tab === 'structure' && <FeeStructureTab />}
      {activeSchool && tab === 'ledger' && <LedgerTab />}
      {activeSchool && tab === 'report' && <FinancialReportTab />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Fee structure                                                       */
/* ------------------------------------------------------------------ */
function FeeStructureTab() {
  const { activeSchool } = useSchool()
  const schoolId = activeSchool!.id
  const qc = useQueryClient()
  const [dialog, setDialog] = useState<{ open: boolean; fee: FeeStructure | null }>({ open: false, fee: null })

  const { data: session } = useCurrentSession(schoolId)
  const { data: levels } = useQuery({
    queryKey: ['class_levels', schoolId],
    queryFn: async () => {
      const { data } = await supabase.from('class_levels').select('id, name').eq('school_id', schoolId).order('sort_order')
      return (data ?? []) as { id: string; name: string }[]
    },
  })
  const { data: terms } = useQuery({
    queryKey: ['terms', session?.id],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase.from('terms').select('id, name').eq('session_id', session!.id).order('name')
      return (data ?? []) as { id: string; name: string }[]
    },
  })
  const { data: fees } = useQuery({
    queryKey: ['fee_structures', schoolId],
    queryFn: async () => {
      const { data } = await supabase.from('fee_structures').select('*').eq('school_id', schoolId).order('name')
      return (data ?? []) as FeeStructure[]
    },
  })

  const levelName = (id: string | null) => (id ? (levels?.find((l) => l.id === id)?.name ?? '—') : 'All classes')
  const termName = (id: string | null) => (id ? (TERM_LABEL[terms?.find((t) => t.id === id)?.name ?? ''] ?? '—') : 'All terms')

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fee_structures').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee_structures', schoolId] }),
  })

  return (
    <Card>
      <CardHeader
        title="Fee structure"
        description="Fees that apply for the current session. Leave class/term empty to apply to all."
        action={
          <Button size="sm" onClick={() => setDialog({ open: true, fee: null })} disabled={!session}>
            <Plus className="h-4 w-4" /> Add fee
          </Button>
        }
      />
      {!fees || fees.length === 0 ? (
        <EmptyState icon={Receipt} title="No fees defined" description="Add fees like Tuition, PTA, or Exam fee." />
      ) : (
        <ul className="divide-y divide-border">
          {fees.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="font-medium text-foreground">{f.name}</p>
                <p className="text-xs text-muted">
                  {levelName(f.class_level_id)} · {termName(f.term_id)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium tabular-nums text-foreground">
                  {formatMoney(Number(f.amount), activeSchool!.currency)}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setDialog({ open: true, fee: f })} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => confirm(`Delete "${f.name}"?`) && del.mutate(f.id)}
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog.open && session && (
        <FeeDialog
          schoolId={schoolId}
          sessionId={session.id}
          fee={dialog.fee}
          levels={levels ?? []}
          terms={terms ?? []}
          onClose={() => setDialog({ open: false, fee: null })}
          onSaved={() => {
            setDialog({ open: false, fee: null })
            qc.invalidateQueries({ queryKey: ['fee_structures', schoolId] })
          }}
        />
      )}
    </Card>
  )
}

function FeeDialog({
  schoolId,
  sessionId,
  fee,
  levels,
  terms,
  onClose,
  onSaved,
}: {
  schoolId: string
  sessionId: string
  fee: FeeStructure | null
  levels: { id: string; name: string }[]
  terms: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(fee?.name ?? '')
  const [amount, setAmount] = useState(fee?.amount != null ? String(fee.amount) : '')
  const [levelId, setLevelId] = useState(fee?.class_level_id ?? '')
  const [termId, setTermId] = useState(fee?.term_id ?? '')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        amount: Number(amount) || 0,
        class_level_id: levelId || null,
        term_id: termId || null,
        session_id: sessionId,
      }
      if (fee) {
        const { error } = await supabase.from('fee_structures').update(payload).eq('id', fee.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('fee_structures').insert({ ...payload, school_id: schoolId })
        if (error) throw error
      }
    },
    onSuccess: onSaved,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not save fee.'),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={fee ? 'Edit fee' : 'Add fee'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim() || !amount}>
            {fee ? 'Save' : 'Add fee'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Fee name" htmlFor="f-name">
          <Input id="f-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Tuition" />
        </Field>
        <Field label="Amount" htmlFor="f-amount">
          <Input id="f-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50000" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Class level" htmlFor="f-level" hint="Empty = all">
            <Select id="f-level" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
              <option value="">All classes</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Term" htmlFor="f-term" hint="Empty = all">
            <Select id="f-term" value={termId} onChange={(e) => setTermId(e.target.value)}>
              <option value="">All terms</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>{TERM_LABEL[t.name] ?? t.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Invoices & payments                                                 */
/* ------------------------------------------------------------------ */
interface InvoiceRow {
  studentId: string
  name: string
  admissionNo: string | null
  invoiceId: string | null
  total: number
  paid: number
  status: string
  arrears: number
  history: { label: string; balance: number }[]
  breakdown: Record<string, number>
}
interface FeeCol {
  key: string
  label: string
}
interface InvoiceData {
  rows: InvoiceRow[]
  feeCols: FeeCol[]
}

const TERM_ORDER: Record<string, number> = { first: 1, second: 2, third: 3 }

function InvoicesTab() {
  const { activeSchool } = useSchool()
  const schoolId = activeSchool!.id
  const currency = activeSchool!.currency
  const qc = useQueryClient()
  const [armId, setArmId] = useState('')
  const [termId, setTermId] = useState('')
  const [payFor, setPayFor] = useState<InvoiceRow | null>(null)
  const [detailFor, setDetailFor] = useState<InvoiceRow | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { data: session } = useCurrentSession(schoolId)
  const { data: terms } = useQuery({
    queryKey: ['terms', session?.id],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase.from('terms').select('id, name, is_current').eq('session_id', session!.id).order('name')
      return (data ?? []) as { id: string; name: string; is_current: boolean }[]
    },
  })
  // Default to the current term once terms load. Done in an effect (not inside
  // the query) so it still runs when the terms come from the persisted cache.
  useEffect(() => {
    if (!termId && terms && terms.length) setTermId((terms.find((t) => t.is_current) ?? terms[0]).id)
  }, [terms, termId])
  const { data: arms } = useQuery({
    queryKey: ['class_arms_full', schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from('class_arms')
        .select('id, name, class_level_id, class_levels(name, sort_order)')
        .eq('school_id', schoolId)
      return (data ?? []).map((a) => {
        const lvl = a.class_levels as unknown as { name: string; sort_order: number } | null
        return { id: a.id as string, levelId: a.class_level_id as string, label: `${lvl?.name ?? '—'} ${a.name}` }
      }).sort((x, y) => x.label.localeCompare(y.label))
    },
  })

  const ready = !!armId && !!termId && !!session
  const arm = arms?.find((a) => a.id === armId)

  const { data, isFetching } = useQuery({
    queryKey: ['invoice_rows', schoolId, armId, termId, session?.id],
    enabled: ready,
    queryFn: async (): Promise<InvoiceData> => {
      const { data: enr } = await supabase
        .from('enrollments')
        .select('student_id, students(first_name, last_name, admission_no)')
        .eq('school_id', schoolId)
        .eq('class_arm_id', armId)
        .eq('session_id', session!.id)
      const students = (enr ?? []).map((e) => {
        const s = e.students as unknown as { first_name: string; last_name: string; admission_no: string | null } | null
        return { id: e.student_id as string, name: s ? `${s.last_name}, ${s.first_name}` : '', admissionNo: s?.admission_no ?? null }
      })
      const ids = students.map((s) => s.id)

      // Every invoice for these students, across all terms/sessions, so we can
      // compute arrears carried over from earlier terms.
      const byStudent = new Map<string, { id: string; total: number; paid: number; status: string; sessionName: string; termName: string; termId: string }[]>()
      if (ids.length) {
        const { data: inv } = await supabase
          .from('invoices')
          .select('id, student_id, term_id, total, amount_paid, status, academic_sessions(name), terms(name)')
          .eq('school_id', schoolId)
          .in('student_id', ids)
        for (const i of inv ?? []) {
          const ses = i.academic_sessions as unknown as { name: string } | null
          const trm = i.terms as unknown as { name: string } | null
          const arr = byStudent.get(i.student_id as string) ?? []
          arr.push({
            id: i.id as string,
            total: Number(i.total),
            paid: Number(i.amount_paid),
            status: i.status as string,
            sessionName: ses?.name ?? '',
            termName: trm?.name ?? '',
            termId: (i.term_id as string) ?? '',
          })
          byStudent.set(i.student_id as string, arr)
        }
      }

      const selSession = session!.name
      const selOrder = TERM_ORDER[terms?.find((t) => t.id === termId)?.name ?? ''] ?? 0
      const isEarlier = (sName: string, tName: string) => {
        const tOrd = TERM_ORDER[tName] ?? 0
        if (sName < selSession) return true
        if (sName === selSession && tOrd < selOrder) return true
        return false
      }
      const termLabel = (sName: string, tName: string) => `${TERM_LABEL[tName] ?? tName} ${sName}`.trim()

      // Per-fee-structure breakdown of the current term's invoice for each student.
      const currentInvId = new Map<string, string>()
      for (const s of students) {
        const inv = (byStudent.get(s.id) ?? []).find((i) => i.termId === termId)
        if (inv) currentInvId.set(s.id, inv.id)
      }
      const feeColMap = new Map<string, string>()
      const breakdownByStudent = new Map<string, Record<string, number>>()
      const invIds = [...currentInvId.values()]
      if (invIds.length) {
        const { data: items } = await supabase
          .from('invoice_items')
          .select('invoice_id, fee_structure_id, description, amount')
          .in('invoice_id', invIds)
        const studentByInv = new Map<string, string>()
        for (const [sid, iid] of currentInvId) studentByInv.set(iid, sid)
        for (const it of items ?? []) {
          const key = (it.fee_structure_id as string) ?? `d:${it.description}`
          feeColMap.set(key, it.description as string)
          const sid = studentByInv.get(it.invoice_id as string)
          if (!sid) continue
          const bd = breakdownByStudent.get(sid) ?? {}
          bd[key] = (bd[key] ?? 0) + Number(it.amount)
          breakdownByStudent.set(sid, bd)
        }
      }
      const feeCols: FeeCol[] = [...feeColMap.entries()]
        .map(([key, label]) => ({ key, label }))
        .sort((a, b) => a.label.localeCompare(b.label))

      const rows = students
        .map((s): InvoiceRow => {
          const invs = byStudent.get(s.id) ?? []
          const current = invs.find((i) => i.termId === termId)
          const arrears = invs
            .filter((i) => i.termId !== termId && isEarlier(i.sessionName, i.termName))
            .reduce((sum, i) => sum + Math.max(0, i.total - i.paid), 0)
          const history = invs
            .map((i) => ({ label: termLabel(i.sessionName, i.termName), balance: Math.max(0, i.total - i.paid) }))
            .filter((h) => h.balance > 0)
          return {
            studentId: s.id,
            name: s.name,
            admissionNo: s.admissionNo,
            invoiceId: current?.id ?? null,
            total: current?.total ?? 0,
            paid: current?.paid ?? 0,
            status: current?.status ?? 'none',
            arrears,
            history,
            breakdown: breakdownByStudent.get(s.id) ?? {},
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      return { rows, feeCols }
    },
  })

  const rows = data?.rows
  const feeCols = data?.feeCols ?? []

  // Generate or refresh invoices so every student's bill matches the current
  // applicable fee structures (adds new fees, removes duplicates/stale items).
  const generate = useMutation({
    mutationFn: async () => {
      if (!arm || !session) return
      const { data: applicable } = await supabase
        .from('fee_structures')
        .select('id, name, amount, class_level_id, term_id')
        .eq('school_id', schoolId)
        .eq('session_id', session.id)
      const fees = (applicable ?? []).filter(
        (f) => (f.class_level_id == null || f.class_level_id === arm.levelId) && (f.term_id == null || f.term_id === termId),
      )
      if (!fees.length) throw new Error('No fees apply to this class/term. Add fees in the Fee structure tab.')
      const total = fees.reduce((s, f) => s + Number(f.amount), 0)

      for (const r of rows ?? []) {
        let invoiceId = r.invoiceId
        if (!invoiceId) {
          const { data: inv, error } = await supabase
            .from('invoices')
            .insert({
              school_id: schoolId,
              student_id: r.studentId,
              session_id: session.id,
              term_id: termId,
              total,
              status: 'issued',
              reference: `INV-${Date.now().toString(36).toUpperCase()}-${r.admissionNo ?? ''}`,
            })
            .select('id')
            .single()
          if (error) throw error
          invoiceId = inv.id as string
        } else {
          // Rebuild the items from the current fee structures (dedupes + updates)
          // and refresh the invoice total.
          const { error: delErr } = await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)
          if (delErr) throw delErr
          const { error: updErr } = await supabase.from('invoices').update({ total }).eq('id', invoiceId)
          if (updErr) throw updErr
        }
        const items = fees.map((f) => ({ school_id: schoolId, invoice_id: invoiceId!, fee_structure_id: f.id, description: f.name, amount: Number(f.amount) }))
        const { error: insErr } = await supabase.from('invoice_items').insert(items)
        if (insErr) throw insErr
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoice_rows', schoolId, armId, termId] }),
  })

  const summary = useMemo(() => {
    const list = rows ?? []
    return {
      billed: list.reduce((s, r) => s + r.total, 0),
      collected: list.reduce((s, r) => s + r.paid, 0),
      outstanding: list.reduce((s, r) => s + Math.max(0, r.total - r.paid), 0),
      arrears: list.reduce((s, r) => s + r.arrears, 0),
    }
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (rows ?? []).filter((r) => {
      if (q && !`${r.name} ${r.admissionNo ?? ''}`.toLowerCase().includes(q)) return false
      if (statusFilter === 'paid' && r.status !== 'paid') return false
      if (statusFilter === 'part' && r.status !== 'part_paid') return false
      if (statusFilter === 'unpaid' && !(r.status === 'issued' || r.status === 'none' || r.paid <= 0)) return false
      if (statusFilter === 'arrears' && r.arrears <= 0) return false
      return true
    })
  }, [rows, search, statusFilter])

  const statusText = (s: string) =>
    s === 'paid' ? 'Paid' : s === 'part_paid' ? 'Part-paid' : s === 'none' ? 'No invoice' : 'Unpaid'

  const exportCols: Column[] = [
    { key: 'adm', label: 'Adm. No.' },
    { key: 'name', label: 'Student' },
    ...feeCols.map((fc) => ({ key: `fee_${fc.key}`, label: fc.label, align: 'right' as const })),
    { key: 'total', label: 'Total', align: 'right' as const },
    { key: 'paid', label: 'Paid', align: 'right' as const },
    { key: 'balance', label: 'Balance', align: 'right' as const },
    { key: 'arrears', label: 'Arrears', align: 'right' as const },
    { key: 'status', label: 'Status', align: 'center' as const },
  ]
  const exportRows = (formatted: boolean) =>
    filteredRows.map((r) => {
      const money = (n: number) => (formatted ? formatMoney(n, currency) : n)
      const row: Record<string, unknown> = {
        adm: r.admissionNo ?? '—',
        name: r.name,
        total: r.invoiceId ? money(r.total) : formatted ? '—' : 0,
        paid: r.invoiceId ? money(r.paid) : formatted ? '—' : 0,
        balance: r.invoiceId ? money(r.total - r.paid) : formatted ? '—' : 0,
        arrears: r.arrears > 0 ? money(r.arrears) : formatted ? '—' : 0,
        status: statusText(r.status),
      }
      for (const fc of feeCols) {
        const v = r.breakdown[fc.key]
        row[`fee_${fc.key}`] = v != null ? money(v) : formatted ? '—' : 0
      }
      return row
    })
  const exportPdf = () => {
    const termLabel = TERM_LABEL[terms?.find((t) => t.id === termId)?.name ?? ''] ?? ''
    const header = docHeaderHtml({
      name: activeSchool?.name ?? 'School',
      address: activeSchool?.address,
      logoUrl: activeSchool?.logo_url,
      title: 'Fees Register',
      subtitle: `${arm?.label ?? ''} · ${termLabel} · Collected ${formatMoney(summary.collected, currency)} of ${formatMoney(summary.billed, currency)}`,
    })
    printHtml('Fees Register', header + tableHtml(exportCols, exportRows(true)))
  }
  const exportXlsx = () => exportSheet('Fees Register', exportCols, exportRows(false), 'Fees', 'Fees Register')

  return (
    <div>
      <Card className="mb-4">
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Class</label>
            <Select value={armId} onChange={(e) => setArmId(e.target.value)} disabled={!session}>
              <option value="">Select a class…</option>
              {(arms ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Term</label>
            <Select value={termId} onChange={(e) => setTermId(e.target.value)}>
              {(terms ?? []).map((t) => (
                <option key={t.id} value={t.id}>{TERM_LABEL[t.name] ?? t.name}</option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      {!ready ? (
        <Card><CardBody className="py-12 text-center text-sm text-muted">Select a class and term to manage fees.</CardBody></Card>
      ) : isFetching && !rows ? (
        <Card><CardBody className="py-12 text-center text-sm text-muted">Loading…</CardBody></Card>
      ) : !rows || rows.length === 0 ? (
        <Card><CardBody className="py-12 text-center text-sm text-muted">No students enrolled in this class.</CardBody></Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Billed (this term)" value={formatMoney(summary.billed, currency)} />
            <Stat label="Collected" value={formatMoney(summary.collected, currency)} tone="text-success" />
            <Stat label="Outstanding" value={formatMoney(summary.outstanding, currency)} tone="text-danger" />
            <Stat label="Arrears (prev. terms)" value={formatMoney(summary.arrears, currency)} tone="text-warning" />
          </div>
          {generate.isError && <p className="mb-3 text-sm text-danger">{(generate.error as Error).message}</p>}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <Input className="pl-9" placeholder="Search student" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
              <option value="">All statuses</option>
              <option value="paid">Fully paid</option>
              <option value="part">Part payment</option>
              <option value="unpaid">Unpaid</option>
              <option value="arrears">Owing arrears</option>
            </Select>
            <ExportButtons onPdf={exportPdf} onExcel={exportXlsx} />
            <Button variant="outline" onClick={() => generate.mutate()} loading={generate.isPending}>
              <Wand2 className="h-4 w-4" /> Generate / update invoices
            </Button>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-faint">
                    <th className="px-5 py-3 font-medium">Student</th>
                    {feeCols.map((fc) => (
                      <th key={fc.key} className="px-3 py-3 text-right font-medium">{fc.label}</th>
                    ))}
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    <th className="px-4 py-3 text-right font-medium">Paid</th>
                    <th className="px-4 py-3 text-right font-medium">Balance</th>
                    <th className="px-4 py-3 text-right font-medium">Arrears</th>
                    <th className="px-4 py-3 text-center font-medium">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => {
                    const balance = r.total - r.paid
                    return (
                      <tr key={r.studentId} className="border-b border-border last:border-0">
                        <td className="px-5 py-3">
                          {r.invoiceId ? (
                            <button type="button" onClick={() => setDetailFor(r)} className="text-left hover:text-primary">
                              <p className="font-medium text-foreground">{r.name}</p>
                              {r.admissionNo && <p className="font-mono text-xs text-muted">{r.admissionNo}</p>}
                            </button>
                          ) : (
                            <>
                              <p className="font-medium text-foreground">{r.name}</p>
                              {r.admissionNo && <p className="font-mono text-xs text-muted">{r.admissionNo}</p>}
                            </>
                          )}
                        </td>
                        {feeCols.map((fc) => (
                          <td key={fc.key} className="px-3 py-3 text-right tabular-nums text-muted">
                            {r.breakdown[fc.key] != null ? formatMoney(r.breakdown[fc.key], currency) : '—'}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right tabular-nums">{r.invoiceId ? formatMoney(r.total, currency) : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-success">{r.invoiceId ? formatMoney(r.paid, currency) : '—'}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{r.invoiceId ? formatMoney(balance, currency) : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {r.arrears > 0 ? (
                            <span className="font-medium text-warning">{formatMoney(r.arrears, currency)}</span>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center"><StatusPill status={r.status} /></td>
                        <td className="px-4 py-3 text-right">
                          {r.invoiceId && balance > 0 && (
                            <Button variant="outline" size="sm" className="whitespace-nowrap px-4" onClick={() => setPayFor(r)}>
                              Record payment
                            </Button>
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

      {payFor && payFor.invoiceId && (
        <PaymentDialog
          schoolId={schoolId}
          currency={currency}
          row={payFor}
          onClose={() => setPayFor(null)}
          onSaved={() => {
            setPayFor(null)
            qc.invalidateQueries({ queryKey: ['invoice_rows', schoolId, armId, termId] })
          }}
        />
      )}

      {detailFor && detailFor.invoiceId && (
        <FeeDetailDialog
          row={detailFor}
          currency={currency}
          school={activeSchool!}
          termLabel={TERM_LABEL[terms?.find((t) => t.id === termId)?.name ?? ''] ?? ''}
          sessionName={session?.name ?? ''}
          onClose={() => setDetailFor(null)}
          onRecordPayment={() => {
            setPayFor(detailFor)
            setDetailFor(null)
          }}
        />
      )}
    </div>
  )
}

interface DetailSchool {
  id: string
  name: string
  address: string | null
  logo_url: string | null
}

function FeeDetailDialog({
  row,
  currency,
  school,
  termLabel,
  sessionName,
  onClose,
  onRecordPayment,
}: {
  row: InvoiceRow
  currency: string
  school: DetailSchool
  termLabel: string
  sessionName: string
  onClose: () => void
  onRecordPayment: () => void
}) {
  const { data } = useQuery({
    queryKey: ['invoice_detail', row.invoiceId],
    enabled: !!row.invoiceId,
    queryFn: async () => {
      const [{ data: items }, { data: payments }, { data: inv }] = await Promise.all([
        supabase.from('invoice_items').select('description, amount').eq('invoice_id', row.invoiceId!),
        supabase.from('payments').select('amount, method, bank_name, teller_no, reference, paid_at').eq('invoice_id', row.invoiceId!).order('paid_at', { ascending: false }),
        supabase.from('invoices').select('reference, due_date').eq('id', row.invoiceId!).maybeSingle(),
      ])
      return {
        items: (items ?? []) as { description: string; amount: number }[],
        payments: (payments ?? []) as { amount: number; method: string; bank_name: string | null; teller_no: string | null; reference: string | null; paid_at: string }[],
        reference: (inv?.reference as string) ?? '',
      }
    },
  })

  const balance = row.total - row.paid
  const items = data?.items ?? []
  const payments = data?.payments ?? []

  const printInvoice = () => {
    const header = docHeaderHtml({
      name: school.name,
      address: school.address,
      logoUrl: school.logo_url,
      title: 'Fee Invoice',
      subtitle: `${row.name}${row.admissionNo ? ' · ' + row.admissionNo : ''} · ${termLabel} ${sessionName}`,
    })
    const itemsTable = tableHtml(
      [
        { key: 'desc', label: 'Description' },
        { key: 'amount', label: 'Amount', align: 'right' },
      ],
      [
        ...items.map((it) => ({ desc: it.description, amount: formatMoney(Number(it.amount), currency) })),
        { desc: 'TOTAL', amount: formatMoney(row.total, currency) },
        { desc: 'Paid', amount: formatMoney(row.paid, currency) },
        { desc: 'Balance due', amount: formatMoney(balance, currency) },
      ],
    )
    const ref = data?.reference ? `<p class="doc-sub">Invoice ${escapeHtml(data.reference)}</p>` : ''
    printHtml('Fee Invoice', header + ref + itemsTable)
  }

  const printStatement = () => {
    const header = docHeaderHtml({
      name: school.name,
      address: school.address,
      logoUrl: school.logo_url,
      title: 'Payment Statement',
      subtitle: `${row.name}${row.admissionNo ? ' · ' + row.admissionNo : ''} · Paid ${formatMoney(row.paid, currency)} of ${formatMoney(row.total, currency)}`,
    })
    const table = tableHtml(
      [
        { key: 'date', label: 'Date' },
        { key: 'method', label: 'Method' },
        { key: 'bank', label: 'Bank / Teller' },
        { key: 'amount', label: 'Amount', align: 'right' },
      ],
      payments.map((p) => ({
        date: formatDate(p.paid_at, { day: 'numeric', month: 'short', year: 'numeric' }),
        method: p.method.replace('_', ' '),
        bank: [p.bank_name, p.teller_no].filter(Boolean).join(' · ') || '—',
        amount: formatMoney(Number(p.amount), currency),
      })),
    )
    printHtml('Payment Statement', header + table)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={row.name}
      description={row.admissionNo ?? undefined}
      className="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={printInvoice}><Printer className="h-4 w-4" /> Invoice</Button>
          <Button variant="outline" onClick={printStatement}><Printer className="h-4 w-4" /> Statement</Button>
          {balance > 0 && <Button onClick={onRecordPayment}>Record payment</Button>}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <MiniMoney label="Total" value={formatMoney(row.total, currency)} />
          <MiniMoney label="Paid" value={formatMoney(row.paid, currency)} tone="text-success" />
          <MiniMoney label="Balance" value={formatMoney(balance, currency)} tone="text-danger" />
        </div>

        {row.history.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-faint">
              Outstanding by term{row.arrears > 0 ? ` · ${formatMoney(row.arrears, currency)} from earlier terms` : ''}
            </p>
            <ul className="rounded-md border border-border text-sm">
              {row.history.map((h, i) => (
                <li key={i} className="flex justify-between border-b border-border px-4 py-2 last:border-0">
                  <span className="text-foreground">{h.label}</span>
                  <span className="font-medium tabular-nums text-danger">{formatMoney(h.balance, currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-faint">Invoice items</p>
          <ul className="rounded-md border border-border text-sm">
            {items.length === 0 ? (
              <li className="px-4 py-2 text-muted">No items.</li>
            ) : (
              items.map((it, i) => (
                <li key={i} className="flex justify-between border-b border-border px-4 py-2 last:border-0">
                  <span>{it.description}</span>
                  <span className="tabular-nums">{formatMoney(Number(it.amount), currency)}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-faint">Payments</p>
          {payments.length === 0 ? (
            <p className="text-sm text-muted">No payments recorded yet.</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto rounded-md border border-border text-sm">
              {payments.map((p, i) => (
                <li key={i} className="flex items-center justify-between border-b border-border px-4 py-2 last:border-0">
                  <div>
                    <p className="font-medium text-foreground">{formatMoney(Number(p.amount), currency)}</p>
                    <p className="text-xs text-muted">
                      {formatDate(p.paid_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                      {p.bank_name ? ` · ${p.bank_name}` : ''}
                      {p.teller_no ? ` · ${p.teller_no}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  )
}

function MiniMoney({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border py-2">
      <p className={cn('font-serif text-base font-semibold tabular-nums', tone ?? 'text-foreground')}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

function PaymentDialog({
  schoolId,
  currency,
  row,
  onClose,
  onSaved,
}: {
  schoolId: string
  currency: string
  row: InvoiceRow
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useAuth()
  const { pushPayment } = useSync()
  const balance = row.total - row.paid
  const [bank, setBank] = useState('')
  const [teller, setTeller] = useState('')
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [queued, setQueued] = useState(false)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [initDone, setInitDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // The invoice's fee structures and how much of each is still outstanding
  // (billed minus what earlier payments already allocated to it).
  const { data: fees } = useQuery({
    queryKey: ['pay_fees', row.invoiceId],
    enabled: !!row.invoiceId,
    queryFn: async () => {
      const [{ data: items }, { data: pays }] = await Promise.all([
        supabase.from('invoice_items').select('fee_structure_id, description, amount').eq('invoice_id', row.invoiceId!),
        supabase.from('payments').select('allocation').eq('invoice_id', row.invoiceId!),
      ])
      const allocated = new Map<string, number>()
      for (const p of pays ?? []) {
        const a = (p.allocation ?? {}) as Record<string, number>
        for (const [k, v] of Object.entries(a)) allocated.set(k, (allocated.get(k) ?? 0) + Number(v))
      }
      return (items ?? []).map((it) => {
        const key = (it.fee_structure_id as string) ?? `desc:${it.description}`
        const billed = Number(it.amount)
        return { key, label: it.description as string, billed, remaining: Math.max(0, billed - (allocated.get(key) ?? 0)) }
      })
    },
  })

  // Default each fee's input to its outstanding amount, once loaded.
  useEffect(() => {
    if (fees && !initDone) {
      const init: Record<string, string> = {}
      for (const f of fees) init[f.key] = f.remaining > 0 ? String(f.remaining) : ''
      setInputs(init)
      setInitDone(true)
    }
  }, [fees, initDone])

  const hasFees = (fees?.length ?? 0) > 0
  const total = hasFees
    ? (fees ?? []).reduce((s, f) => s + (Number(inputs[f.key]) || 0), 0)
    : Number(inputs.__single ?? '') || 0

  const save = useMutation({
    mutationFn: async () => {
      const allocation: Record<string, number> = {}
      if (hasFees) {
        for (const f of fees ?? []) {
          const v = Number(inputs[f.key]) || 0
          if (v > 0) allocation[f.key] = v
        }
      }
      const row_ = {
        id: crypto.randomUUID(),
        school_id: schoolId,
        invoice_id: row.invoiceId!,
        amount: total,
        method: 'bank_transfer',
        bank_name: bank.trim() || null,
        teller_no: teller.trim() || null,
        reference: reference.trim() || null,
        status: 'confirmed',
        recorded_by: user?.id ?? null,
        paid_at: new Date().toISOString(),
        allocation: hasFees ? allocation : null,
      }
      return pushPayment({ row: row_, receipt: file })
    },
    onSuccess: (result) => {
      if (result === 'queued') setQueued(true)
      else onSaved()
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not record payment.'),
  })

  if (queued) {
    return (
      <Dialog
        open
        onClose={onClose}
        title="Saved offline"
        description={row.name}
        footer={<Button onClick={onClose}>Done</Button>}
      >
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-warning/15 text-warning">
            <Check className="h-6 w-6" />
          </span>
          <div>
            <p className="font-medium text-foreground">
              Payment of {formatMoney(total, currency)} recorded offline.
            </p>
            <p className="mt-1 text-sm text-muted">
              It will sync automatically when you&apos;re back online
              {file ? ', and the receipt will upload then too' : ''}. The balance
              will update after it syncs.
            </p>
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Record payment"
      description={`${row.name} · balance ${formatMoney(balance, currency)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={total <= 0}>
            Record {formatMoney(total, currency)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {hasFees ? (
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Amount paid — by fee</p>
            <div className="rounded-md border border-border">
              {(fees ?? []).map((f) => (
                <div key={f.key} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{f.label}</p>
                    <p className="text-xs text-muted">Outstanding {formatMoney(f.remaining, currency)}</p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    className="w-28 text-right tabular-nums"
                    value={inputs[f.key] ?? ''}
                    onChange={(e) => setInputs((m) => ({ ...m, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="flex items-center justify-between bg-muted-surface px-3 py-2">
                <span className="text-sm font-medium text-foreground">Total</span>
                <span className="font-semibold tabular-nums text-foreground">{formatMoney(total, currency)}</span>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted">Enter how much of this payment goes to each fee.</p>
          </div>
        ) : (
          <Field label="Amount paid" htmlFor="p-amt">
            <Input id="p-amt" type="number" min={0} max={balance} value={inputs.__single ?? ''} onChange={(e) => setInputs((m) => ({ ...m, __single: e.target.value }))} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bank" htmlFor="p-bank">
            <Input id="p-bank" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="First Bank" />
          </Field>
          <Field label="Teller / ref no." htmlFor="p-teller">
            <Input id="p-teller" value={teller} onChange={(e) => setTeller(e.target.value)} />
          </Field>
        </div>
        <Field label="Note / reference" htmlFor="p-ref">
          <Input id="p-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. paid at branch" />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Receipt</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp className="h-4 w-4" /> {file ? 'Change file' : 'Upload receipt'}
            </Button>
            {file && (
              <span className="flex items-center gap-1 text-sm text-success">
                <Check className="h-4 w-4" /> {file.name}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">Photo or PDF of the bank teller · up to 5&nbsp;MB</p>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
function useCurrentSession(schoolId: string) {
  return useQuery({
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

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'bg-success/15 text-success',
    part_paid: 'bg-warning/15 text-warning',
    issued: 'bg-muted-surface text-muted',
    none: 'bg-muted-surface text-faint',
  }
  const label: Record<string, string> = { paid: 'Paid', part_paid: 'Part-paid', issued: 'Unpaid', none: 'No invoice' }
  return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', map[status] ?? map.none)}>{label[status] ?? status}</span>
}
