import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useAuth } from '@/lib/auth'
import { listPendingForUser, subscribeQueue, type PendingTransaction } from './queue'
import { syncManager, type SyncState } from './sync'

export function useSyncState(): SyncState {
  return useSyncExternalStore(syncManager.subscribe, syncManager.getState, syncManager.getState)
}

/**
 * Live list of the signed-in user's queued transactions (re-reads IndexedDB
 * whenever the queue or the user changes). Other users' items are never returned.
 */
export function usePendingTransactions(): PendingTransaction[] {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [items, setItems] = useState<PendingTransaction[]>([])
  const reload = useCallback(() => {
    void listPendingForUser(userId).then(setItems)
  }, [userId])
  useEffect(() => {
    reload()
    return subscribeQueue(reload)
  }, [reload])
  return items
}
