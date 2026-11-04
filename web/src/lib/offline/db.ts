import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { CreateTransactionRequest } from '@/types/api'

export type PendingStatus = 'pending' | 'syncing' | 'failed'

export type PendingTransaction = {
  /** Client-generated UUID, also sent as `client_id` so retries are idempotent. */
  client_id: string
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

interface XpensivDB extends DBSchema {
  pendingTransactions: {
    key: string
    value: PendingTransaction
    indexes: { 'by-status': PendingStatus; 'by-created': string }
  }
}

const DB_NAME = 'xpensiv'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<XpensivDB>> | null = null

export function getDB(): Promise<IDBPDatabase<XpensivDB>> {
  if (!dbPromise) {
    dbPromise = openDB<XpensivDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('pendingTransactions', { keyPath: 'client_id' })
        store.createIndex('by-status', 'status')
        store.createIndex('by-created', 'created_at')
      },
    })
  }
  return dbPromise
}

/** Test helper: drops the cached connection so a fresh fake DB can be used. */
export function resetDBForTests() {
  dbPromise = null
}
