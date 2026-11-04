import { api, isNetworkError } from '@/lib/api'
import type { CreateTransactionRequest, Transaction } from '@/types/api'
import { enqueueTransaction, newClientId, type PendingTransaction } from './queue'
import { syncManager } from './sync'

export type SubmitResult =
  { queued: false; transaction: Transaction } | { queued: true; pending: PendingTransaction }

/**
 * Creates a transaction, falling back to the offline queue when the network is
 * unavailable. Validation errors (4xx) are thrown to the caller so the form can
 * show them; only transport failures are queued.
 */
export async function submitTransaction(payload: CreateTransactionRequest): Promise<SubmitResult> {
  const client_id = payload.client_id ?? newClientId()
  const body = { ...payload, client_id }
  const online = typeof navigator === 'undefined' ? true : navigator.onLine
  if (!online) {
    const pending = await enqueueTransaction(body, client_id)
    return { queued: true, pending }
  }
  try {
    const transaction = await api.post<Transaction>('/transactions', body)
    return { queued: false, transaction }
  } catch (e) {
    if (isNetworkError(e)) {
      const pending = await enqueueTransaction(body, client_id)
      void syncManager.refreshCounts()
      return { queued: true, pending }
    }
    throw e
  }
}
