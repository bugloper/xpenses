import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { isApiError } from './api'

const ONE_DAY = 24 * 60 * 60 * 1000

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
  key: 'xpensiv-query-cache',
  throttleTime: 1000,
})

export const persistOptions = {
  persister: queryPersister,
  maxAge: ONE_DAY,
  buster: 'v1',
}
