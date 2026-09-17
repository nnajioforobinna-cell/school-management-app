import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { uploadReceipt } from '@/lib/storage'
import {
  count as outboxCount,
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
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    let before = 0
    try {
      before = await outboxCount()
      await flushOutbox()
    } finally {
      const after = await outboxCount()
      await refreshPending()
      setSyncing(false)
      syncingRef.current = false
      // If anything actually synced, refetch so the freshly-synced data appears.
      if (after < before) queryClient.invalidateQueries()
    }
  }, [refreshPending])

  // Track connectivity and flush pending writes. navigator.onLine and the
  // online/offline events are unreliable on iOS, so we don't depend on them
  // alone: we also flush when the app regains focus/visibility and on a slow
  // timer while anything is queued.
  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      void syncNow()
    }
    const goOffline = () => setOnline(false)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setOnline(navigator.onLine)
        void syncNow()
      }
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)

    // Retry loop: while items are queued, keep trying every 20s.
    const timer = setInterval(async () => {
      if ((await outboxCount()) > 0) void syncNow()
    }, 20_000)

    void refreshPending()
    void syncNow()
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [syncNow, refreshPending])

  const pushOrQueue = useCallback(
    async (input: QueueInput): Promise<'synced' | 'queued'> => {
      // navigator.onLine is unreliable on iOS (often stays true with Wi-Fi off),
      // so we always TRY the write and treat any failure — returned error OR a
      // thrown network error — as a signal to queue. Never lose the write.
      if (navigator.onLine) {
        try {
          const query = supabase.from(input.table as 'attendance')
          const { error } = await query.upsert(
            input.rows as never,
            input.onConflict ? { onConflict: input.onConflict } : undefined,
          )
          if (!error) return 'synced'
        } catch {
          /* network threw — fall through to queue */
        }
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
        try {
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
          // fall through: online but the insert returned an error — queue it.
        } catch {
          /* network threw — fall through to queue */
        }
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
