/**
 * Persist the TanStack Query cache to IndexedDB so previously-loaded data
 * (class rosters, invoices, scores…) renders instantly and works while the
 * device is offline. Only successful queries are stored; anything that errored
 * is skipped so we never persist a failed/empty fetch.
 *
 * Role-scoping falls out naturally: each role only ever runs the queries its
 * pages need (a teacher only hits the gradebook, a prefect only attendance),
 * so the persisted cache on a given device only ever holds that role's data.
 */
import { get, set, del } from 'idb-keyval'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { PersistQueryClientOptions, PersistedClient } from '@tanstack/react-query-persist-client'
import { queryClient } from '@/lib/queryClient'

const IDB_KEY = 'sms-query-cache'

// Bump when the cached shape changes to invalidate old caches on all devices.
// v2: switched off JSON serialization (v1 corrupted Map-valued queries).
const CACHE_BUSTER = 'v2'

const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get(key),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: IDB_KEY,
  throttleTime: 1000,
  // IndexedDB stores structured-cloneable values directly, so skip JSON — it
  // would turn Map/Date query results into {} and crash pages that read them.
  serialize: (client) => client as unknown as string,
  deserialize: (client) => client as unknown as PersistedClient,
})

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: 1000 * 60 * 60 * 24 * 7, // discard cache older than 7 days
  buster: CACHE_BUSTER,
  dehydrateOptions: {
    // Never persist a query that isn't holding good data.
    shouldDehydrateQuery: (query) => query.state.status === 'success',
  },
}

export { queryClient }
