import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { CreateTransactionRequest } from '@/types/api'

export type PendingStatus = 'pending' | 'syncing' | 'failed'

export type PendingTransaction = {
  /** Client-generated UUID, also sent as `client_id` so retries are idempotent. */
  client_id: string
  /**
   * Owner of the item (the signed-in user when it was queued). `null` only for
   * items queued before accounts existed; they are claimed by the first user who
   * drains the queue (see `claimOrphanedPending`).
   */
  user_id: string | null
  payload: CreateTransactionRequest
  status: PendingStatus
  attempts: number
  last_error: string | null
  /** Server error code when status = failed (e.g. validation_error). */
  error_code: string | null
  created_at: string
  updated_at: string
  /** Epoch ms before which the sync manager will not retry (backoff). */
  next_attempt_at: number
}

/** An image queued alongside a transaction, uploaded once the transaction exists. */
export type PendingAttachment = { client_id: string; blob: Blob; name: string; type: string }

interface XpensesDB extends DBSchema {
  pendingTransactions: {
    key: string
    value: PendingTransaction
    indexes: { 'by-status': PendingStatus; 'by-created': string }
  }
  pendingAttachments: { key: string; value: PendingAttachment }
}

const DB_NAME = 'xpenses'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase<XpensesDB>> | null = null

export function getDB(): Promise<IDBPDatabase<XpensesDB>> {
  if (!dbPromise) {
    dbPromise = openDB<XpensesDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('pendingTransactions', { keyPath: 'client_id' })
          store.createIndex('by-status', 'status')
          store.createIndex('by-created', 'created_at')
        }
        if (oldVersion < 2) db.createObjectStore('pendingAttachments', { keyPath: 'client_id' })
      },
    })
  }
  return dbPromise
}

/** Test helper: drops the cached connection so a fresh fake DB can be used. */
export function resetDBForTests() {
  dbPromise = null
}
