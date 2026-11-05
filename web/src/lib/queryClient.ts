import { QueryClient, type Query } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { isApiError } from './api'

const ONE_DAY = 24 * 60 * 60 * 1000

/** localStorage key of the persisted query cache (removed on logout). */
export const QUERY_CACHE_STORAGE_KEY = 'xpenses-query-cache'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: ONE_DAY, // must be >= persister maxAge so restored data is kept
      retry: (count, err) => {
        if (isApiError(err) && !err.isNetwork && err.status < 500) return false
        return count < 2
      },
      refetchOnWindowFocus: true,
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'offlineFirst' },
  },
})

/** Persists the query cache so dashboard + lists render last-known data offline. */
export const queryPersister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: QUERY_CACHE_STORAGE_KEY,
  throttleTime: 1000,
})

/**
 * Queries flagged `meta: { persist: false }` (auth status, sessions, admin lists)
 * are never written to localStorage: they must be fresh on every app load.
 */
function shouldDehydrateQuery(query: Query): boolean {
  if (query.state.status !== 'success') return false
  return query.meta?.persist !== false
}

export const persistOptions = {
  persister: queryPersister,
  maxAge: ONE_DAY,
  buster: 'v2',
  dehydrateOptions: { shouldDehydrateQuery },
}
