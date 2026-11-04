import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { listPending, subscribeQueue, type PendingTransaction } from './queue'
import { syncManager, type SyncState } from './sync'

export function useSyncState(): SyncState {
  return useSyncExternalStore(syncManager.subscribe, syncManager.getState, syncManager.getState)
}

/** Live list of queued transactions (re-reads IndexedDB whenever the queue changes). */
export function usePendingTransactions(): PendingTransaction[] {
  const [items, setItems] = useState<PendingTransaction[]>([])
  const reload = useCallback(() => {
    void listPending().then(setItems)
  }, [])
  useEffect(() => {
    reload()
    return subscribeQueue(reload)
  }, [reload])
  return items
}
