import { api, isNetworkError } from '@/lib/api'
import { uploadAttachment } from '@/lib/attachments'
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
export async function submitTransaction(
  payload: CreateTransactionRequest,
  attachment: File | null = null,
): Promise<SubmitResult> {
  const client_id = payload.client_id ?? newClientId()
  const body = { ...payload, client_id }
  const online = typeof navigator === 'undefined' ? true : navigator.onLine
  if (!online) {
    const pending = await enqueueTransaction(body, client_id, attachment)
    return { queued: true, pending }
  }
  try {
    let transaction = await api.post<Transaction>('/transactions', body)
    if (attachment) transaction = await uploadAttachment(transaction.id, attachment)
    return { queued: false, transaction }
  } catch (e) {
    if (isNetworkError(e)) {
      // The create is idempotent, so queueing the same client_id again is safe
      // even when the transaction itself got through and only the image did not.
      const pending = await enqueueTransaction(body, client_id, attachment)
      void syncManager.refreshCounts()
      return { queued: true, pending }
    }
    throw e
  }
}
