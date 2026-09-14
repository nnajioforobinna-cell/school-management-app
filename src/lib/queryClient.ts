import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Keep cached data around long enough to serve reads while offline.
      // (Persisted to IndexedDB — see src/lib/queryPersist.ts.)
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
