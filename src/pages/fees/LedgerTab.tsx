import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Trash2, Tags, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { useSchool } from '@/providers/SchoolProvider'
import type { Tables } from '@/types/database'
import { docHeaderHtml, printHtml, tableHtml, type Column } from '@/lib/print'
import { exportSheet } from '@/lib/excel'
import { formatDate, formatMoney, cn } from '@/lib/utils'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { DatePicker } from '@/components/ui/date-picker'
import { ExportButtons } from '@/components/ExportButtons'

type LedgerEntry = Tables<'ledger_entries'>
type LedgerCategory = Tables<'ledger_categories'>

const DEFAULT_CATEGORIES: { name: string; kind: 'income' | 'expense' }[] = [
  // Income
  { name: 'Canteen', kind: 'income' },
  { name: 'School Uniform Sales', kind: 'income' },
  { name: 'Exercise & Textbook Sales', kind: 'income' },
  { name: 'Other Sales', kind: 'income' },
  { name: 'Donations', kind: 'income' },
  // Expense
  { name: 'Salaries', kind: 'expense' },
  { name: 'Textbooks', kind: 'expense' },
  { name: 'Stationery', kind: 'expense' },
  { name: 'Car Service and Maintenance', kind: 'expense' },
  { name: 'Repairs and Building Maintenance', kind: 'expense' },
  { name: 'Health', kind: 'expense' },
  { name: 'Travel and Transportation', kind: 'expense' },
  { name: 'Fuel and Gas', kind: 'expense' },
  { name: 'Feeding', kind: 'expense' },
  { name: 'Seminars and Conferences', kind: 'expense' },
  { name: 'Retreats', kind: 'expense' },
  { name: 'Sports', kind: 'expense' },
  { name: 'Utilities', kind: 'expense' },
  { name: 'Miscellaneous', kind: 'expense' },
]

export function LedgerTab() {
  const { activeSchool } = useSchool()
  const schoolId = activeSchool!.id
  const currency = activeSchool!.currency
  const qc = useQueryClient()

  const [entryDialog, setEntryDialog] = useState<{ open: boolean; entry: LedgerEntry | null }>({ open: false, entry: null })
  const [manageCats, setManageCats] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [account, setAccount] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [search, setSearch] = useState('')

  const { data: session } = useQuery({
    queryKey: ['current_session', schoolId],
    queryFn: async () => {
      const { data } = await supabase.from('academic_sessions').select('id').eq('school_id', schoolId).eq('is_current', true).maybeSingle()
      return data as { id: string } | null
    },
  })
  const { data: term } = useQuery({
    queryKey: ['current_term', session?.id],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase.from('terms').select('id').eq('session_id', session!.id).eq('is_current', true).maybeSingle()
      return data as { id: string } | null
    },
  })

  const { data: categories } = useQuery({
    queryKey: ['ledger_categories', schoolId],
    queryFn: async () => {
      const { data } = await supabase.from('ledger_categories').select('*').eq('school_id', schoolId).order('name')
      return (data ?? []) as LedgerCategory[]
    },
  })
  const catName = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c.name])), [categories])

  const { data: entries } = useQuery({
    queryKey: ['ledger_entries', schoolId],
    queryFn: async () => {
      const { data } = await supabase.from('ledger_entries').select('*').eq('school_id', schoolId).order('date', { ascending: false }).order('created_at', { ascending: false })
      return (data ?? []) as LedgerEntry[]
    },
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ledger_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ledger_entries', schoolId] }),
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (entries ?? []).filter((e) => {
      if (from && e.date < from) return false
      if (to && e.date > to) return false
      if (account && e.kind !== account) return false
      if (catFilter && e.category_id !== catFilter) return false
      if (q && !`${e.party ?? ''} ${e.description ?? ''} ${catName.get(e.category_id ?? '') ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [entries, from, to, account, catFilter, search, catName])

  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    for (const e of filtered) {
      if (e.kind === 'income') income += Number(e.amount)
      else expense += Number(e.amount)
    }
    return { income, expense, net: income - expense }
  }, [filtered])

  const exportCols: Column[] = [
    { key: 'date', label: 'Date' },
    { key: 'account', label: 'Account' },
    { key: 'category', label: 'Category' },
    { key: 'party', label: 'Payer / Payee' },
    { key: 'description', label: 'Description' },
    { key: 'amount', label: `Amount (${currency})`, align: 'right' },
  ]
  const exportRows = () =>
    filtered.map((e) => ({
      date: formatDate(e.date, { day: '2-digit', month: 'short', year: 'numeric' }),
      account: e.kind === 'income' ? 'Income' : 'Expense',
      category: catName.get(e.category_id ?? '') ?? '—',
      party: e.party ?? '—',
      description: e.description ?? '—',
      amount: Number(e.amount),
    }))
  const exportPdf = () => {
    const header = docHeaderHtml({
      name: activeSchool?.name ?? 'School',
      address: activeSchool?.address,
      logoUrl: activeSchool?.logo_url,
      title: 'Accounts Ledger',
      subtitle: `Income ${formatMoney(totals.income, currency)} · Expense ${formatMoney(totals.expense, currency)} · Net ${formatMoney(totals.net, currency)}`,
    })
    // Format amounts for the printed sheet.
    const rows = exportRows().map((r) => ({ ...r, amount: formatMoney(Number(r.amount), currency) }))
    printHtml('Accounts Ledger', header + tableHtml(exportCols, rows))
  }
  const exportXlsx = () => exportSheet('Accounts Ledger', exportCols, exportRows(), 'Ledger', 'Accounts Ledger')

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Income" value={formatMoney(totals.income, currency)} tone="text-success" />
        <Stat label="Expenses" value={formatMoney(totals.expense, currency)} tone="text-danger" />
        <Stat label="Net" value={formatMoney(totals.net, currency)} tone={totals.net >= 0 ? 'text-success' : 'text-danger'} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Search party or description" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={account} onChange={(e) => setAccount(e.target.value)} className="w-auto">
          <option value="">All accounts</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </Select>
        <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="w-auto">
          <option value="">All categories</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <ExportButtons onPdf={exportPdf} onExcel={exportXlsx} />
        <Button variant="outline" onClick={() => setManageCats(true)}>
          <Tags className="h-4 w-4" /> Categories
        </Button>
        <Button onClick={() => setEntryDialog({ open: true, entry: null })}>
          <Plus className="h-4 w-4" /> Add entry
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">From date</label>
          <DatePicker value={from} onChange={setFrom} minYear={2015} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">To date</label>
          <DatePicker value={to} onChange={setTo} minYear={2015} />
        </div>
        {(from || to) && (
          <button className="pb-2 text-primary hover:underline" onClick={() => { setFrom(''); setTo('') }}>Clear dates</button>
        )}
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No ledger entries"
            description="Record the school's daily income and expenses. Add categories, then log each transaction."
            action={
              <Button onClick={() => setEntryDialog({ open: true, entry: null })}>
                <Plus className="h-4 w-4" /> Add your first entry
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-faint">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Payer / Payee</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">{formatDate(e.date, { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', e.kind === 'income' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
                        {e.kind === 'income' ? 'Income' : 'Expense'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-foreground">{catName.get(e.category_id ?? '') ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted">{e.party ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted">{e.description ?? '—'}</td>
                    <td className={cn('whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums', e.kind === 'income' ? 'text-success' : 'text-danger')}>
                      {e.kind === 'income' ? '+' : '−'}{formatMoney(Number(e.amount), currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEntryDialog({ open: true, entry: e })} aria-label="Edit">Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => confirm('Delete this entry?') && del.mutate(e.id)} aria-label="Delete">
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {entryDialog.open && (
        <EntryDialog
          schoolId={schoolId}
          entry={entryDialog.entry}
          categories={categories ?? []}
          sessionId={session?.id ?? null}
          termId={term?.id ?? null}
          onClose={() => setEntryDialog({ open: false, entry: null })}
          onSaved={() => {
            setEntryDialog({ open: false, entry: null })
            qc.invalidateQueries({ queryKey: ['ledger_entries', schoolId] })
          }}
        />
      )}

      {manageCats && (
        <CategoriesDialog
          schoolId={schoolId}
          categories={categories ?? []}
          onClose={() => setManageCats(false)}
          onChanged={() => qc.invalidateQueries({ queryKey: ['ledger_categories', schoolId] })}
        />
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

function EntryDialog({
  schoolId,
  entry,
  categories,
  sessionId,
  termId,
  onClose,
  onSaved,
}: {
  schoolId: string
  entry: LedgerEntry | null
  categories: LedgerCategory[]
  sessionId: string | null
  termId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useAuth()
  const [date, setDate] = useState(entry?.date ?? new Date().toISOString().slice(0, 10))
  const [kind, setKind] = useState<'income' | 'expense'>(entry?.kind ?? 'expense')
  const [categoryId, setCategoryId] = useState(entry?.category_id ?? '')
  const [party, setParty] = useState(entry?.party ?? '')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [amount, setAmount] = useState(entry?.amount != null ? String(entry.amount) : '')
  const [error, setError] = useState<string | null>(null)

  const options = categories.filter((c) => c.kind === kind)

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        date,
        kind,
        category_id: categoryId || null,
        party: party.trim() || null,
        description: description.trim() || null,
        amount: Number(amount) || 0,
      }
      if (entry) {
        const { error } = await supabase.from('ledger_entries').update(payload).eq('id', entry.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('ledger_entries')
          .insert({ ...payload, school_id: schoolId, session_id: sessionId, term_id: termId, created_by: user?.id ?? null })
        if (error) throw error
      }
    },
    onSuccess: onSaved,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not save entry.'),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={entry ? 'Edit entry' : 'Add ledger entry'}
      className="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!amount || Number(amount) <= 0}>
            {entry ? 'Save' : 'Add entry'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" htmlFor="le-date">
            <DatePicker value={date} onChange={setDate} minYear={2015} />
          </Field>
          <Field label="Account" htmlFor="le-kind">
            <Select id="le-kind" value={kind} onChange={(e) => { setKind(e.target.value as 'income' | 'expense'); setCategoryId('') }}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </Select>
          </Field>
        </div>
        <Field label="Category" htmlFor="le-cat" hint={options.length === 0 ? 'No categories yet — add some under "Categories".' : undefined}>
          <Select id="le-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorised</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={kind === 'income' ? 'Payer (from)' : 'Payee (to)'} htmlFor="le-party">
            <Input id="le-party" value={party} onChange={(e) => setParty(e.target.value)} placeholder={kind === 'income' ? 'e.g. Canteen' : 'e.g. PHCN'} />
          </Field>
          <Field label="Amount" htmlFor="le-amt">
            <Input id="le-amt" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </Field>
        </div>
        <Field label="Description" htmlFor="le-desc">
          <Input id="le-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was it for?" />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}

function CategoriesDialog({
  schoolId,
  categories,
  onClose,
  onChanged,
}: {
  schoolId: string
  categories: LedgerCategory[]
  onClose: () => void
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'income' | 'expense'>('expense')
  const [error, setError] = useState<string | null>(null)

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('ledger_categories').insert({ school_id: schoolId, name: name.trim(), kind })
      if (error) throw error
    },
    onSuccess: () => { setName(''); onChanged() },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not add category.'),
  })

  const seed = useMutation({
    mutationFn: async () => {
      const existing = new Set(categories.map((c) => `${c.kind}:${c.name}`))
      const rows = DEFAULT_CATEGORIES.filter((d) => !existing.has(`${d.kind}:${d.name}`)).map((d) => ({ school_id: schoolId, name: d.name, kind: d.kind }))
      if (rows.length) {
        const { error } = await supabase.from('ledger_categories').insert(rows)
        if (error) throw error
      }
    },
    onSuccess: onChanged,
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ledger_categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: onChanged,
  })

  const income = categories.filter((c) => c.kind === 'income')
  const expense = categories.filter((c) => c.kind === 'expense')

  return (
    <Dialog
      open
      onClose={onClose}
      title="Ledger categories"
      description="Categories for income and expenses. Used in entries and the financial report."
      className="max-w-lg"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-2">
          <Field label="New category" htmlFor="cat-name" className="flex-1">
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Photocopying" />
          </Field>
          <Select value={kind} onChange={(e) => setKind(e.target.value as 'income' | 'expense')} className="w-32">
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </Select>
          <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!name.trim()}>Add</Button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}

        {categories.length === 0 && (
          <button className="self-start text-sm font-medium text-primary hover:underline" onClick={() => seed.mutate()}>
            + Add a set of common school categories
          </button>
        )}

        <div className="grid grid-cols-2 gap-4">
          <CatList title="Income" cats={income} onDelete={(id) => del.mutate(id)} />
          <CatList title="Expense" cats={expense} onDelete={(id) => del.mutate(id)} />
        </div>
      </div>
    </Dialog>
  )
}

function CatList({ title, cats, onDelete }: { title: string; cats: LedgerCategory[]; onDelete: (id: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-faint">{title}</p>
      {cats.length === 0 ? (
        <p className="text-sm text-muted">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {cats.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
              <span className="truncate text-foreground">{c.name}</span>
              <button onClick={() => confirm(`Delete category "${c.name}"?`) && onDelete(c.id)} aria-label="Delete" className="text-faint hover:text-danger">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
