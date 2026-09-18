import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, FileUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { useSync } from '@/providers/SyncProvider'
import { formatMoney, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Dialog } from '@/components/ui/dialog'

export interface EditablePayment {
  id: string
  allocation: Record<string, number> | null
  amount: number
  bank_name: string | null
  teller_no: string | null
  reference: string | null
}

/** The minimal invoice info the dialog needs. */
export interface PayableInvoice {
  invoiceId: string
  name: string
  total: number
  paid: number
}

export function PaymentDialog({
  schoolId,
  currency,
  invoice,
  editing,
  collectedSessionId,
  collectedTermId,
  onClose,
  onSaved,
}: {
  schoolId: string
  currency: string
  invoice: PayableInvoice
  editing?: EditablePayment | null
  /** Period this collection belongs to (current session/term). New payments only. */
  collectedSessionId?: string | null
  collectedTermId?: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useAuth()
  const { pushPayment } = useSync()
  const isEdit = !!editing
  const balance = invoice.total - invoice.paid
  const [bank, setBank] = useState(editing?.bank_name ?? '')
  const [teller, setTeller] = useState(editing?.teller_no ?? '')
  const [reference, setReference] = useState(editing?.reference ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [queued, setQueued] = useState(false)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [initDone, setInitDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Per fee: billed, capacity for THIS payment (billed minus what OTHER payments
  // took), what's still owed overall, and this payment's current split (edit).
  const { data: fees } = useQuery({
    queryKey: ['pay_fees', invoice.invoiceId, editing?.id ?? 'new'],
    enabled: !!invoice.invoiceId,
    staleTime: 0,
    queryFn: async () => {
      const [{ data: items }, { data: pays }] = await Promise.all([
        supabase.from('invoice_items').select('fee_structure_id, description, amount').eq('invoice_id', invoice.invoiceId),
        supabase.from('payments').select('id, allocation').eq('invoice_id', invoice.invoiceId),
      ])
      const allocatedAll = new Map<string, number>()
      const allocatedOthers = new Map<string, number>()
      for (const p of pays ?? []) {
        const a = (p.allocation ?? {}) as Record<string, number>
        for (const [k, v] of Object.entries(a)) {
          allocatedAll.set(k, (allocatedAll.get(k) ?? 0) + Number(v))
          if (p.id !== editing?.id) allocatedOthers.set(k, (allocatedOthers.get(k) ?? 0) + Number(v))
        }
      }
      const cur = (editing?.allocation ?? {}) as Record<string, number>
      return (items ?? []).map((it) => {
        const key = (it.fee_structure_id as string) ?? `desc:${it.description}`
        const billed = Number(it.amount)
        return {
          key,
          label: it.description as string,
          billed,
          capacity: Math.max(0, billed - (allocatedOthers.get(key) ?? 0)),
          overallRemaining: Math.max(0, billed - (allocatedAll.get(key) ?? 0)),
          current: Number(cur[key] ?? 0),
        }
      })
    },
  })

  useEffect(() => {
    if (fees && !initDone) {
      const init: Record<string, string> = {}
      for (const f of fees) init[f.key] = isEdit ? (f.current > 0 ? String(f.current) : '') : f.capacity > 0 ? String(f.capacity) : ''
      setInputs(init)
      setInitDone(true)
    }
  }, [fees, initDone, isEdit])

  const hasFees = (fees?.length ?? 0) > 0
  const total = hasFees
    ? (fees ?? []).reduce((s, f) => s + (Number(inputs[f.key]) || 0), 0)
    : Number(inputs.__single ?? '') || 0

  const clampNum = (v: string, max: number) => {
    if (v === '') return ''
    const n = Number(v)
    if (Number.isNaN(n)) return ''
    return String(Math.max(0, Math.min(max, Math.round(n * 100) / 100)))
  }

  const save = useMutation({
    mutationFn: async () => {
      const allocation: Record<string, number> = {}
      if (hasFees) {
        for (const f of fees ?? []) {
          const v = Number(inputs[f.key]) || 0
          if (v > 0) allocation[f.key] = v
        }
      }
      if (isEdit) {
        const { error } = await supabase
          .from('payments')
          .update({
            amount: total,
            bank_name: bank.trim() || null,
            teller_no: teller.trim() || null,
            reference: reference.trim() || null,
            allocation: (hasFees ? allocation : null) as never,
          })
          .eq('id', editing!.id)
        if (error) throw error
        return 'synced' as const
      }
      const row_ = {
        id: crypto.randomUUID(),
        school_id: schoolId,
        invoice_id: invoice.invoiceId,
        amount: total,
        method: 'bank_transfer',
        bank_name: bank.trim() || null,
        teller_no: teller.trim() || null,
        reference: reference.trim() || null,
        status: 'confirmed',
        recorded_by: user?.id ?? null,
        paid_at: new Date().toISOString(),
        allocation: hasFees ? allocation : null,
        collected_session_id: collectedSessionId ?? null,
        collected_term_id: collectedTermId ?? null,
      }
      return pushPayment({ row: row_, receipt: file })
    },
    onSuccess: (result) => {
      if (result === 'queued') setQueued(true)
      else onSaved()
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not save payment.'),
  })

  if (queued) {
    return (
      <Dialog open onClose={onClose} title="Saved offline" description={invoice.name} footer={<Button onClick={onClose}>Done</Button>}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-warning/15 text-warning">
            <Check className="h-6 w-6" />
          </span>
          <div>
            <p className="font-medium text-foreground">Payment of {formatMoney(total, currency)} recorded offline.</p>
            <p className="mt-1 text-sm text-muted">
              It will sync automatically when you&apos;re back online
              {file ? ', and the receipt will upload then too' : ''}. The balance will update after it syncs.
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
      title={isEdit ? 'Edit payment' : 'Record payment'}
      description={`${invoice.name} · balance ${formatMoney(balance, currency)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={total <= 0}>
            {isEdit ? 'Save' : 'Record'} {formatMoney(total, currency)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {hasFees ? (
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Amount paid — by fee</p>
            <div className="rounded-md border border-border">
              {(fees ?? []).map((f) => {
                const paidFully = f.overallRemaining <= 0
                const partPaid = f.overallRemaining > 0 && f.overallRemaining < f.billed
                return (
                  <div key={f.key} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm text-foreground">
                        {paidFully && <Check className="h-4 w-4 shrink-0 text-success" />}
                        {f.label}
                        {partPaid && (
                          <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-warning">Part</span>
                        )}
                      </p>
                      <p className={cn('text-xs', paidFully ? 'text-success' : 'text-muted')}>
                        {paidFully
                          ? `Paid in full · ${formatMoney(f.billed, currency)}`
                          : `Outstanding ${formatMoney(f.overallRemaining, currency)} of ${formatMoney(f.billed, currency)}`}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={f.capacity}
                      disabled={f.capacity <= 0}
                      className="w-28 text-right tabular-nums disabled:opacity-50"
                      value={inputs[f.key] ?? ''}
                      onChange={(e) => setInputs((m) => ({ ...m, [f.key]: clampNum(e.target.value, f.capacity) }))}
                    />
                  </div>
                )
              })}
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
        {!isEdit && (
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
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}
