import { currentUserId } from '@/lib/auth'
import { getDB, type PendingAttachment, type PendingStatus, type PendingTransaction } from './db'
import type { CreateTransactionRequest } from '@/types/api'

export type { PendingTransaction, PendingStatus, PendingAttachment }

type Listener = () => void
const listeners = new Set<Listener>()

/** Subscribe to queue mutations (used by the sync manager + UI). */
export function subscribeQueue(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notify() {
  for (const l of listeners) l()
}

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // RFC4122 v4 fallback
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function enqueueTransaction(
  payload: CreateTransactionRequest,
  clientId?: string,
  attachment?: File | null,
): Promise<PendingTransaction> {
  const db = await getDB()
  const id = clientId ?? payload.client_id ?? newClientId()
  if (attachment) {
    await db.put('pendingAttachments', { client_id: id, blob: attachment, name: attachment.name, type: attachment.type })
  }
  const now = new Date().toISOString()
  const item: PendingTransaction = {
    client_id: id,
    user_id: currentUserId(),
    payload: { ...payload, client_id: id },
    status: 'pending',
    attempts: 0,
    last_error: null,
    error_code: null,
    created_at: now,
    updated_at: now,
    next_attempt_at: 0,
  }
  await db.put('pendingTransactions', item)
  notify()
  return item
}

/** The image queued with a transaction, if any. */
export async function getPendingAttachment(clientId: string): Promise<File | null> {
  const db = await getDB()
  const rec = await db.get('pendingAttachments', clientId)
  return rec ? new File([rec.blob], rec.name, { type: rec.type }) : null
}

export async function removePendingAttachment(clientId: string): Promise<void> {
  const db = await getDB()
  await db.delete('pendingAttachments', clientId)
}

/** Every queued item, all users, oldest first. UI code should use `listPendingForUser`. */
export async function listPending(): Promise<PendingTransaction[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('pendingTransactions', 'by-created')
  return all.map((i) => (i.user_id === undefined ? { ...i, user_id: null } : i))
}

/**
 * True when `item` may be shown to / synced for `userId`. Items without an owner
 * (queued before the account system existed) belong to whoever is signed in;
 * nothing is visible while signed out.
 */
export function belongsToUser(item: Pick<PendingTransaction, 'user_id'>, userId: string | null): boolean {
  if (userId === null) return false
  return item.user_id === null || item.user_id === userId
}

export function filterForUser<T extends Pick<PendingTransaction, 'user_id'>>(
  items: T[],
  userId: string | null,
): T[] {
  return items.filter((i) => belongsToUser(i, userId))
}

/** The current user's queued items (other users' items stay in the store, hidden). */
export async function listPendingForUser(
  userId: string | null = currentUserId(),
): Promise<PendingTransaction[]> {
  return filterForUser(await listPending(), userId)
}

export async function getPending(clientId: string): Promise<PendingTransaction | undefined> {
  const db = await getDB()
  return db.get('pendingTransactions', clientId)
}

export async function countPending(
  userId: string | null = currentUserId(),
): Promise<{ pending: number; syncing: number; failed: number }> {
  const items = await listPendingForUser(userId)
  return {
    pending: items.filter((i) => i.status === 'pending').length,
    syncing: items.filter((i) => i.status === 'syncing').length,
    failed: items.filter((i) => i.status === 'failed').length,
  }
}

export async function updatePending(
  clientId: string,
  patch: Partial<Omit<PendingTransaction, 'client_id' | 'created_at'>>,
): Promise<PendingTransaction | undefined> {
  const db = await getDB()
  const tx = db.transaction('pendingTransactions', 'readwrite')
  const current = await tx.store.get(clientId)
  if (!current) {
    await tx.done
    return undefined
  }
  const next: PendingTransaction = { ...current, ...patch, updated_at: new Date().toISOString() }
  await tx.store.put(next)
  await tx.done
  notify()
  return next
}

/**
 * Assigns ownerless items (queued before accounts existed) to `userId`. Run on
 * the first drain after login so they sync under that user and stop being
 * visible to anyone else. Returns how many were claimed.
 */
export async function claimOrphanedPending(userId: string): Promise<number> {
  const db = await getDB()
  const tx = db.transaction('pendingTransactions', 'readwrite')
  let claimed = 0
  for (const item of await tx.store.getAll()) {
    if (item.user_id === null || item.user_id === undefined) {
      await tx.store.put({ ...item, user_id: userId, updated_at: new Date().toISOString() })
      claimed++
    }
  }
  await tx.done
  if (claimed > 0) notify()
  return claimed
}

/** Replace the payload of a failed item (user fixed it) and put it back in the queue. */
export async function reviseAndRequeue(clientId: string, payload: CreateTransactionRequest) {
  return updatePending(clientId, {
    payload: { ...payload, client_id: clientId },
    status: 'pending',
    attempts: 0,
    last_error: null,
    error_code: null,
    next_attempt_at: 0,
  })
}

export async function retryPending(clientId: string) {
  return updatePending(clientId, {
    status: 'pending',
    next_attempt_at: 0,
    last_error: null,
    error_code: null,
  })
}

export async function removePending(clientId: string): Promise<void> {
  await removePendingAttachment(clientId)
  const db = await getDB()
  await db.delete('pendingTransactions', clientId)
  notify()
}

/** Exponential backoff: 2s, 4s, 8s ... capped at 5 minutes. */
export function backoffMs(attempts: number): number {
  const base = 2000 * 2 ** Math.max(0, attempts - 1)
  return Math.min(base, 5 * 60_000)
}
