import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { uploadReceipt } from '@/lib/storage'
import {
  enqueue,
  enqueueReceipt,
  flushOutbox,
  pendingCount,
  type SyncTable,
} from '@/lib/offline/outbox'

interface QueueInput {
  table: SyncTable
  rows: Record<string, unknown>[]
  onConflict?: string
  label: string
}

/** A bank payment plus an optional receipt file. */
interface PaymentInput {
  /** Full payments row, including a client-generated `id`. */
  row: Record<string, unknown>
  receipt?: File | null
}

interface SyncContextValue {
  online: boolean
  pending: number
  syncing: boolean
  /** Writes now if online; queues for later if offline or the write fails. */
  pushOrQueue: (input: QueueInput) => Promise<'synced' | 'queued'>
  /**
   * Records a payment (and its receipt). When offline, the payment row queues
   * and the receipt file is stored locally to be uploaded and attached on
   * reconnect. Returns whether it went straight through or was queued.
   */
  pushPayment: (input: PaymentInput) => Promise<'synced' | 'queued'>
  syncNow: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined)

export function SyncProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState<boolean>(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)

  const refreshPending = useCallback(async () => {
    setPending(await pendingCount())
  }, [])

  const syncNow = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return
    syncingRef.current = true
    setSyncing(true)
    try {
      await flushOutbox()
    } finally {
      await refreshPending()
      setSyncing(false)
      syncingRef.current = false
    }
  }, [refreshPending])

  // Track connectivity and flush whenever we come back online.
  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      void syncNow()
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    void refreshPending()
    if (navigator.onLine) void syncNow()
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [syncNow, refreshPending])

  const pushOrQueue = useCallback(
    async (input: QueueInput): Promise<'synced' | 'queued'> => {
      if (navigator.onLine) {
        const query = supabase.from(input.table as 'attendance')
        const { error } = await query.upsert(
          input.rows as never,
          input.onConflict ? { onConflict: input.onConflict } : undefined,
        )
        if (!error) return 'synced'
        // fall through: online but the write failed — queue it.
      }
      await enqueue({ table: input.table, rows: input.rows, onConflict: input.onConflict, label: input.label })
      await refreshPending()
      return 'queued'
    },
    [refreshPending],
  )

  const pushPayment = useCallback(
    async (input: PaymentInput): Promise<'synced' | 'queued'> => {
      const paymentId = String(input.row.id)
      const schoolId = String(input.row.school_id)

      if (navigator.onLine) {
        const { error } = await supabase.from('payments').upsert(input.row as never)
        if (!error) {
          // Payment landed; try to attach the receipt too.
          if (input.receipt) {
            try {
              const path = await uploadReceipt(schoolId, paymentId, input.receipt)
              await supabase.from('payments').update({ receipt_image_url: path } as never).eq('id', paymentId)
            } catch {
              // Payment is saved but the receipt upload failed — queue just the
              // receipt so it attaches on the next flush.
              await enqueueReceipt({
                paymentId,
                schoolId,
                blob: input.receipt,
                contentType: input.receipt.type,
                filename: input.receipt.name,
              })
              await refreshPending()
              return 'queued'
            }
          }
          return 'synced'
        }
        // fall through: online but the insert failed — queue it.
      }

      await enqueue({ table: 'payments', rows: [input.row], label: 'Payment' })
      if (input.receipt) {
        await enqueueReceipt({
          paymentId,
          schoolId,
          blob: input.receipt,
          contentType: input.receipt.type,
          filename: input.receipt.name,
        })
      }
      await refreshPending()
      return 'queued'
    },
    [refreshPending],
  )

  const value: SyncContextValue = { online, pending, syncing, pushOrQueue, pushPayment, syncNow }
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSync() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used within <SyncProvider>')
  return ctx
}
