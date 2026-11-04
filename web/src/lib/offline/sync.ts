import { api, isApiError, type ApiError } from '@/lib/api'
import { authStore, currentUserId } from '@/lib/auth'
import type { CreateTransactionRequest, Transaction } from '@/types/api'
import {
  backoffMs,
  claimOrphanedPending,
  listPendingForUser,
  removePending,
  subscribeQueue,
  updatePending,
  type PendingTransaction,
} from './queue'

/** Shown on an item the server refused because the session is gone. */
export const SIGN_IN_TO_SYNC = 'Sign in to sync'

export type SyncState = {
  online: boolean
  syncing: boolean
  pending: number
  failed: number
  lastSyncAt: number | null
  lastError: string | null
}

type Listener = () => void

/**
 * Sync manager for the offline transaction queue.
 *
 * - Retries when the browser comes back online, when the app regains focus,
 *   after any successful API request (signal that the server is reachable),
 *   and on a timer driven by per-item exponential backoff.
 * - Network / 5xx failures keep the item `pending` with a backoff.
 * - 4xx responses (validation, conflict) mark the item `failed` with the
 *   server message so the user can fix or discard it. Nothing is dropped silently.
 * - Only the signed-in user's items are drained or counted. Items of other users
 *   on a shared device stay in IndexedDB untouched until their owner signs in.
 * - A 401 (session expired between queueing and syncing) keeps the item
 *   `pending` with "Sign in to sync" and no attempt-count penalty.
 */
class SyncManager {
  private state: SyncState = {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    syncing: false,
    pending: 0,
    failed: 0,
    lastSyncAt: null,
    lastError: null,
  }
  private listeners = new Set<Listener>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private started = false
  private inFlight: Promise<void> | null = null
  private onSynced: ((tx: Transaction, item: PendingTransaction) => void) | null = null
  private unsubscribeQueue: (() => void) | null = null
  private unsubscribeAuth: (() => void) | null = null

  getState = (): SyncState => this.state

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Called for every item that reaches the server; used to invalidate caches. */
  setOnSynced(fn: ((tx: Transaction, item: PendingTransaction) => void) | null) {
    this.onSynced = fn
  }

  start() {
    if (this.started || typeof window === 'undefined') return
    this.started = true
    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)
    window.addEventListener('focus', this.handleFocus)
    document.addEventListener('visibilitychange', this.handleVisibility)
    window.addEventListener('xpensiv:request-ok', this.handleRequestOk)
    window.addEventListener('xpensiv:request-failed', this.handleRequestFailed)
    this.unsubscribeQueue = subscribeQueue(() => void this.refreshCounts())
    this.unsubscribeAuth = authStore.subscribe(this.handleUserChange)
    void this.refreshCounts()
    void this.syncNow()
  }

  stop() {
    if (!this.started) return
    this.started = false
    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('offline', this.handleOffline)
    window.removeEventListener('focus', this.handleFocus)
    document.removeEventListener('visibilitychange', this.handleVisibility)
    window.removeEventListener('xpensiv:request-ok', this.handleRequestOk)
    window.removeEventListener('xpensiv:request-failed', this.handleRequestFailed)
    this.unsubscribeQueue?.()
    this.unsubscribeQueue = null
    this.unsubscribeAuth?.()
    this.unsubscribeAuth = null
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private setState(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  private handleOnline = () => {
    this.setState({ online: true })
    void this.syncNow()
  }
  private handleOffline = () => this.setState({ online: false })
  /** navigator.onLine is unreliable (true behind a router with no uplink); a failed request is the better signal. */
  private handleRequestFailed = () => {
    if (this.state.online) this.setState({ online: false })
  }
  private lastUserId: string | null = currentUserId()
  /** Counts are per user; a login also drains what that user queued earlier. */
  private handleUserChange = () => {
    const uid = currentUserId()
    if (uid === this.lastUserId) return
    this.lastUserId = uid
    this.setState({ lastError: null })
    void this.refreshCounts()
    if (uid !== null) void this.syncNow()
  }
  private handleFocus = () => void this.syncNow()
  private handleVisibility = () => {
    if (document.visibilityState === 'visible') void this.syncNow()
  }
  private requestOkDebounce: ReturnType<typeof setTimeout> | null = null
  private handleRequestOk = () => {
    if (!this.state.online) this.setState({ online: true })
    if (this.state.pending === 0 || this.state.syncing) return
    if (this.requestOkDebounce) clearTimeout(this.requestOkDebounce)
    this.requestOkDebounce = setTimeout(() => void this.syncNow(), 500)
  }

  async refreshCounts() {
    const items = await listPendingForUser(currentUserId())
    const pending = items.filter((i) => i.status === 'pending' || i.status === 'syncing').length
    const failed = items.filter((i) => i.status === 'failed').length
    if (pending !== this.state.pending || failed !== this.state.failed) this.setState({ pending, failed })
    this.scheduleNext(items)
  }

  private scheduleNext(items: PendingTransaction[]) {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const due = items.filter((i) => i.status === 'pending').map((i) => i.next_attempt_at)
    if (due.length === 0) return
    const next = Math.max(0, Math.min(...due) - Date.now())
    this.timer = setTimeout(() => void this.syncNow(), next + 50)
  }

  /** Drains the queue (one item at a time, oldest first). Safe to call concurrently. */
  syncNow = async (opts: { force?: boolean } = {}): Promise<void> => {
    if (this.inFlight) return this.inFlight
    this.inFlight = this.drain(opts.force ?? false).finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async drain(force: boolean) {
    const online = typeof navigator === 'undefined' ? true : navigator.onLine
    if (!online && !force) {
      await this.refreshCounts()
      return
    }
    const userId = currentUserId()
    if (userId === null) {
      // Nobody signed in: nothing may be sent (and nothing is shown).
      await this.refreshCounts()
      return
    }
    await claimOrphanedPending(userId)
    const items = (await listPendingForUser(userId)).filter(
      (i) => i.status === 'pending' || i.status === 'syncing',
    )
    const now = Date.now()
    const due = items.filter((i) => force || i.next_attempt_at <= now)
    if (due.length === 0) {
      await this.refreshCounts()
      return
    }
    this.setState({ syncing: true, lastError: null })
    try {
      for (const item of due) {
        const ok = await this.push(item)
        if (!ok) break // network is down: stop hammering, backoff timer will retry
      }
    } finally {
      this.setState({ syncing: false, lastSyncAt: Date.now() })
      await this.refreshCounts()
    }
  }

  /** Returns false when the server is unreachable (stop the drain). */
  private async push(item: PendingTransaction): Promise<boolean> {
    await updatePending(item.client_id, { status: 'syncing' })
    try {
      const tx = await api.post<Transaction>('/transactions', item.payload as CreateTransactionRequest)
      await removePending(item.client_id)
      this.onSynced?.(tx, item)
      return true
    } catch (e) {
      const attempts = item.attempts + 1
      if (isApiError(e)) {
        const err = e as ApiError
        if (err.status === 401) {
          // Session gone: not the item's fault. Keep it pending, no penalty, and
          // stop the drain (every other item would 401 too). The api layer has
          // already raised the unauthenticated event that signs the user out.
          await updatePending(item.client_id, {
            status: 'pending',
            last_error: SIGN_IN_TO_SYNC,
            error_code: 'unauthenticated',
          })
          this.setState({ lastError: SIGN_IN_TO_SYNC })
          return false
        }
        if (err.isNetwork || err.status >= 500) {
          await updatePending(item.client_id, {
            status: 'pending',
            attempts,
            last_error: err.message,
            error_code: err.code,
            next_attempt_at: Date.now() + backoffMs(attempts),
          })
          this.setState({ lastError: err.message, online: !err.isNetwork })
          return !err.isNetwork
        }
        // 4xx: the server understood and rejected it. Keep it, mark failed.
        const detail = Object.entries(err.details)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ')
        await updatePending(item.client_id, {
          status: 'failed',
          attempts,
          last_error: detail ? `${err.message}: ${detail}` : err.message,
          error_code: err.code,
        })
        return true
      }
      await updatePending(item.client_id, {
        status: 'pending',
        attempts,
        last_error: e instanceof Error ? e.message : 'Unknown error',
        error_code: 'unknown',
        next_attempt_at: Date.now() + backoffMs(attempts),
      })
      return true
    }
  }
}

export const syncManager = new SyncManager()
