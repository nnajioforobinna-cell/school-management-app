/**
 * Offline write outbox — a small IndexedDB queue of pending writes.
 *
 * When the device is offline (or a write fails), the change is stored here
 * tagged as unsynced. On reconnect the SyncProvider flushes the queue to
 * Supabase in order. This is the self-contained (no external service) version
 * of the offline-first pattern; a sync engine like PowerSync can replace it
 * later without changing the calling code.
 *
 * Two stores:
 *  - `outbox`   — queued table upserts (attendance / scores / payments rows).
 *  - `receipts` — bank-payment receipt files (blobs) waiting to be uploaded to
 *                 Storage and attached to their payment once the device is back
 *                 online. A payment is recorded offline with a client-generated
 *                 id; the receipt is keyed by that same id so it can be attached
 *                 to the right payment on reconnect.
 */
import { supabase } from '@/lib/supabase'
import { uploadReceipt } from '@/lib/storage'

const DB_NAME = 'sms-offline'
const DB_VERSION = 2
const STORE = 'outbox'
const STORE_RECEIPTS = 'receipts'

/** Tables that support offline writes (prefect / teacher / bursar flows). */
export type SyncTable = 'attendance' | 'scores' | 'payments'

export interface OutboxItem {
  id: string
  table: SyncTable
  rows: Record<string, unknown>[]
  onConflict?: string
  label: string
  createdAt: number
}

/** A receipt file waiting to be uploaded and attached to its payment. */
export interface ReceiptItem {
  /** Payment id this receipt belongs to (client-generated when offline). */
  paymentId: string
  schoolId: string
  blob: Blob
  contentType: string
  filename: string
  createdAt: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_RECEIPTS)) db.createObjectStore(STORE_RECEIPTS, { keyPath: 'paymentId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const req = fn(tx.objectStore(store))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

/* ---------------------------------------------------------------- */
/* Table-write queue                                                 */
/* ---------------------------------------------------------------- */
export async function enqueue(item: Omit<OutboxItem, 'id' | 'createdAt'>): Promise<OutboxItem> {
  const full: OutboxItem = { ...item, id: crypto.randomUUID(), createdAt: Date.now() }
  await run(STORE, 'readwrite', (s) => s.put(full))
  return full
}

export async function getAll(): Promise<OutboxItem[]> {
  const all = await run<OutboxItem[]>(STORE, 'readonly', (s) => s.getAll() as IDBRequest<OutboxItem[]>)
  return (all ?? []).sort((a, b) => a.createdAt - b.createdAt)
}

export async function remove(id: string): Promise<void> {
  await run(STORE, 'readwrite', (s) => s.delete(id) as unknown as IDBRequest<void>)
}

export async function count(): Promise<number> {
  try {
    return await run<number>(STORE, 'readonly', (s) => s.count())
  } catch {
    return 0
  }
}

/* ---------------------------------------------------------------- */
/* Receipt-file queue                                                */
/* ---------------------------------------------------------------- */
export async function enqueueReceipt(item: Omit<ReceiptItem, 'createdAt'>): Promise<void> {
  const full: ReceiptItem = { ...item, createdAt: Date.now() }
  await run(STORE_RECEIPTS, 'readwrite', (s) => s.put(full))
}

export async function getAllReceipts(): Promise<ReceiptItem[]> {
  const all = await run<ReceiptItem[]>(STORE_RECEIPTS, 'readonly', (s) => s.getAll() as IDBRequest<ReceiptItem[]>)
  return (all ?? []).sort((a, b) => a.createdAt - b.createdAt)
}

export async function removeReceipt(paymentId: string): Promise<void> {
  await run(STORE_RECEIPTS, 'readwrite', (s) => s.delete(paymentId) as unknown as IDBRequest<void>)
}

export async function countReceipts(): Promise<number> {
  try {
    return await run<number>(STORE_RECEIPTS, 'readonly', (s) => s.count())
  } catch {
    return 0
  }
}

/** Total pending items across both queues. */
export async function pendingCount(): Promise<number> {
  const [a, b] = await Promise.all([count(), countReceipts()])
  return a + b
}

/* ---------------------------------------------------------------- */
/* Flush                                                             */
/* ---------------------------------------------------------------- */
/**
 * Push all queued writes to Supabase, oldest first, then upload any queued
 * receipt files and attach them to their payments. Table writes are flushed
 * before receipts so a payment row exists before we attach its receipt. Stops
 * table-write flushing at the first failure (usually the network is still
 * down) and leaves the rest queued.
 */
export async function flushOutbox(): Promise<{ flushed: number; remaining: number }> {
  const items = await getAll()
  let flushed = 0
  let tableWriteFailed = false
  for (const item of items) {
    // Table is a runtime value; cast keeps the typed client happy.
    const query = supabase.from(item.table as 'attendance')
    const { error } = await query.upsert(
      item.rows as never,
      item.onConflict ? { onConflict: item.onConflict } : undefined,
    )
    if (error) {
      tableWriteFailed = true
      break
    }
    await remove(item.id)
    flushed++
  }

  // Only attempt receipt uploads once the payment rows are all in — if a table
  // write just failed we're offline, so skip and try again next flush.
  if (!tableWriteFailed) {
    const receipts = await getAllReceipts()
    for (const r of receipts) {
      try {
        const file = new File([r.blob], r.filename, { type: r.contentType })
        const path = await uploadReceipt(r.schoolId, r.paymentId, file)
        const { error } = await supabase
          .from('payments')
          .update({ receipt_image_url: path })
          .eq('id', r.paymentId)
        if (error) break
        await removeReceipt(r.paymentId)
      } catch {
        break
      }
    }
  }

  return { flushed, remaining: await pendingCount() }
}
