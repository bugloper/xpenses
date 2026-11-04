import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { UNAUTHENTICATED_EVENT } from '@/lib/api'
import { authStore } from '@/lib/auth'
import { resetDBForTests } from './db'
import {
  backoffMs,
  claimOrphanedPending,
  enqueueTransaction,
  filterForUser,
  listPending,
  listPendingForUser,
  removePending,
  retryPending,
  reviseAndRequeue,
  updatePending,
  type PendingTransaction,
} from './queue'
import { SIGN_IN_TO_SYNC, syncManager } from './sync'
import { submitTransaction } from './submit'
import type { CreateTransactionRequest } from '@/types/api'

const payload: CreateTransactionRequest = {
  type: 'expense',
  amount: 8540,
  account_id: 'acc-1',
  category_id: 'cat-food',
  transaction_date: '2026-11-04',
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
    writable: true,
  })
  resetDBForTests()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  // The queue is per user: nothing is drained or listed while signed out.
  authStore.setUser({
    id: 'u1',
    name: 'Nima',
    email: 'nima@example.com',
    role: 'user',
    is_active: true,
    created_at: '',
    last_login_at: null,
  })
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('queue store', () => {
  it('enqueues with a client_id and lists oldest first', async () => {
    const a = await enqueueTransaction(payload)
    const b = await enqueueTransaction({ ...payload, amount: 100 })
    expect(a.client_id).toMatch(/[0-9a-f-]{36}/)
    expect(a.payload.client_id).toBe(a.client_id)
    const items = await listPending()
    expect(items.map((i) => i.client_id)).toEqual([a.client_id, b.client_id])
    expect(items[0]?.status).toBe('pending')
  })

  it('updates, retries and removes', async () => {
    const a = await enqueueTransaction(payload)
    await updatePending(a.client_id, { status: 'failed', last_error: 'nope' })
    expect((await listPending())[0]?.status).toBe('failed')
    await retryPending(a.client_id)
    expect((await listPending())[0]?.status).toBe('pending')
    await removePending(a.client_id)
    expect(await listPending()).toHaveLength(0)
  })

  it('uses capped exponential backoff', () => {
    expect(backoffMs(1)).toBe(2000)
    expect(backoffMs(2)).toBe(4000)
    expect(backoffMs(3)).toBe(8000)
    expect(backoffMs(20)).toBe(300_000)
  })
})

describe('submitTransaction', () => {
  it('queues immediately when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const res = await submitTransaction(payload)
    expect(res.queued).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await listPending()).toHaveLength(1)
  })

  it('queues when the network request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const res = await submitTransaction(payload)
    expect(res.queued).toBe(true)
    expect(await listPending()).toHaveLength(1)
  })

  it('throws validation errors instead of queueing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(422, {
        error: { code: 'validation_error', message: 'validation failed', details: { amount: 'must be > 0' } },
      }),
    )
    await expect(submitTransaction(payload)).rejects.toMatchObject({ status: 422, code: 'validation_error' })
    expect(await listPending()).toHaveLength(0)
  })

  it('returns the created transaction when online', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(201, { data: { id: 'tx-1', ...payload } }))
    const res = await submitTransaction(payload)
    expect(res.queued).toBe(false)
    if (!res.queued) expect(res.transaction.id).toBe('tx-1')
  })
})

describe('syncManager', () => {
  it('pushes pending items and removes them on success', async () => {
    await enqueueTransaction(payload)
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(201, { data: { id: 'tx-1', ...payload } }))
    const synced = vi.fn()
    syncManager.setOnSynced(synced)
    await syncManager.syncNow({ force: true })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [, init] = fetchSpy.mock.calls[0]!
    expect(JSON.parse(init?.body as string).client_id).toBeTruthy()
    expect(await listPending()).toHaveLength(0)
    expect(synced).toHaveBeenCalledTimes(1)
    expect(syncManager.getState().pending).toBe(0)
  })

  it('marks 422 responses as failed with the server message and keeps them', async () => {
    const item = await enqueueTransaction(payload)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(422, {
        error: {
          code: 'validation_error',
          message: 'validation failed',
          details: { category_id: 'must match type' },
        },
      }),
    )
    await syncManager.syncNow({ force: true })
    const items = await listPending()
    expect(items).toHaveLength(1)
    expect(items[0]?.client_id).toBe(item.client_id)
    expect(items[0]?.status).toBe('failed')
    expect(items[0]?.last_error).toContain('category_id must match type')
    expect(syncManager.getState().failed).toBe(1)
  })

  it('retries a lost-response POST with the same client_id and accepts the 200 replay', async () => {
    // First attempt: the server may have stored it, but the response never arrived.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const res = await submitTransaction(payload)
    expect(res.queued).toBe(true)
    const clientId = res.queued ? res.pending.client_id : ''
    expect(JSON.parse(fetchSpy.mock.calls[0]![1]?.body as string).client_id).toBe(clientId)

    // Replay: the Go handler finds the client_id and answers 200 with the existing row.
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { data: { id: 'tx-1', ...payload, client_id: clientId } }),
    )
    const synced = vi.fn()
    syncManager.setOnSynced(synced)
    await syncManager.syncNow({ force: true })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchSpy.mock.calls[1]![1]?.body as string).client_id).toBe(clientId)
    expect(await listPending()).toHaveLength(0)
    expect(synced).toHaveBeenCalledTimes(1)
  })

  it('does not POST twice when two drains are requested concurrently', async () => {
    await enqueueTransaction(payload)
    let release: (r: Response) => void = () => {}
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => new Promise<Response>((resolve) => (release = resolve)))
    const first = syncManager.syncNow({ force: true })
    const second = syncManager.syncNow({ force: true })
    // Let the first drain reach fetch before releasing it.
    await new Promise((r) => setTimeout(r, 20))
    release(jsonResponse(201, { data: { id: 'tx-1', ...payload } }))
    await Promise.all([first, second])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(await listPending()).toHaveLength(0)
  })

  it('keeps items pending (not failed) on a 5xx and backs off', async () => {
    await enqueueTransaction(payload)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: { code: 'internal_error', message: 'boom' } }),
    )
    await syncManager.syncNow({ force: true })
    const items = await listPending()
    expect(items[0]?.status).toBe('pending')
    expect(items[0]?.attempts).toBe(1)
    expect(items[0]?.next_attempt_at).toBeGreaterThan(Date.now())
    expect(syncManager.getState().failed).toBe(0)
  })

  it('never retries a failed (4xx) item on later drains until the user acts', async () => {
    const a = await enqueueTransaction(payload)
    await updatePending(a.client_id, { status: 'failed', last_error: 'validation failed' })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await syncManager.syncNow({ force: true })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect((await listPending())[0]?.status).toBe('failed')
  })

  it('reviseAndRequeue keeps the client_id so the fixed item is still idempotent', async () => {
    const a = await enqueueTransaction(payload)
    await updatePending(a.client_id, { status: 'failed', attempts: 3, last_error: 'nope' })
    await reviseAndRequeue(a.client_id, { ...payload, amount: 999, client_id: 'must-be-ignored' })
    const [item] = await listPending()
    expect(item).toMatchObject({ client_id: a.client_id, status: 'pending', attempts: 0, last_error: null })
    expect(item?.payload.client_id).toBe(a.client_id)
    expect(item?.payload.amount).toBe(999)
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(201, { data: { id: 'tx-2' } }))
    await syncManager.syncNow({ force: true })
    expect(JSON.parse(fetchSpy.mock.calls[0]![1]?.body as string)).toMatchObject({
      client_id: a.client_id,
      amount: 999,
    })
    expect(await listPending()).toHaveLength(0)
  })

  it('keeps items pending with backoff on network failure', async () => {
    await enqueueTransaction(payload)
    await enqueueTransaction({ ...payload, amount: 1 })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await syncManager.syncNow({ force: true })
    const items = await listPending()
    expect(items).toHaveLength(2)
    expect(items[0]?.status).toBe('pending')
    expect(items[0]?.attempts).toBe(1)
    expect(items[0]?.next_attempt_at).toBeGreaterThan(Date.now())
    // stops after the first network failure instead of hammering
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(items[1]?.attempts).toBe(0)
  })
})

describe('per-user queue isolation', () => {
  const otherUser = {
    id: 'u2',
    name: 'Other',
    email: 'other@example.com',
    role: 'user' as const,
    is_active: true,
    created_at: '',
    last_login_at: null,
  }

  it('stamps the signed-in user id on queued items', async () => {
    const a = await enqueueTransaction(payload)
    expect(a.user_id).toBe('u1')
    const [stored] = await listPending()
    expect(stored?.user_id).toBe('u1')
  })

  it('lists only the current user’s items and hides the rest without discarding them', async () => {
    await enqueueTransaction(payload) // u1
    authStore.setUser(otherUser)
    await enqueueTransaction({ ...payload, amount: 2 }) // u2
    expect((await listPendingForUser('u2')).map((i) => i.payload.amount)).toEqual([2])
    expect((await listPendingForUser('u1')).map((i) => i.payload.amount)).toEqual([8540])
    expect(await listPendingForUser(null)).toEqual([])
    expect(await listPending()).toHaveLength(2)
    expect(filterForUser([{ user_id: null }, { user_id: 'u1' }, { user_id: 'u2' }], 'u1')).toEqual([
      { user_id: null },
      { user_id: 'u1' },
    ])
  })

  it('drains only the current user’s items', async () => {
    await enqueueTransaction(payload) // u1
    authStore.setUser(otherUser)
    const mine = await enqueueTransaction({ ...payload, amount: 2 }) // u2
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(201, { data: { id: 'tx-1', ...payload } }))
    await syncManager.syncNow({ force: true })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchSpy.mock.calls[0]![1]?.body as string).client_id).toBe(mine.client_id)
    const left = await listPending()
    expect(left).toHaveLength(1)
    expect(left[0]?.user_id).toBe('u1')
    expect(left[0]?.status).toBe('pending')
    expect(syncManager.getState().pending).toBe(0) // u2 has nothing left; u1's item is not counted
  })

  it('does not drain anything while signed out', async () => {
    await enqueueTransaction(payload)
    authStore.setUser(null)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await syncManager.syncNow({ force: true })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await listPending()).toHaveLength(1)
    expect(syncManager.getState().pending).toBe(0)
  })

  it('keeps an item pending on 401 with "Sign in to sync" and no attempt penalty', async () => {
    const a = await enqueueTransaction(payload)
    const b = await enqueueTransaction({ ...payload, amount: 2 })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(401, { error: { code: 'unauthenticated', message: 'sign in' } }))
    const handler = vi.fn()
    window.addEventListener(UNAUTHENTICATED_EVENT, handler)
    await syncManager.syncNow({ force: true })
    window.removeEventListener(UNAUTHENTICATED_EVENT, handler)
    const items = await listPending()
    expect(items).toHaveLength(2)
    // Both were queued in the same millisecond, so find the one that was pushed by content.
    const pushed = items.find((i) => i.last_error === SIGN_IN_TO_SYNC)
    const untouched = items.find((i) => i.last_error !== SIGN_IN_TO_SYNC)
    expect(pushed).toMatchObject({
      status: 'pending',
      attempts: 0,
      error_code: 'unauthenticated',
      next_attempt_at: 0,
    })
    expect([a.client_id, b.client_id]).toContain(pushed?.client_id)
    // stops after the first 401 instead of hammering every item
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(untouched).toMatchObject({ status: 'pending', attempts: 0, last_error: null })
    expect(syncManager.getState().failed).toBe(0)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('migrates items without a user_id to the current user on the first drain', async () => {
    // An item queued by the pre-auth build: no owner.
    const db = await (await import('./db')).getDB()
    const legacy = {
      client_id: 'legacy-1',
      payload: { ...payload, client_id: 'legacy-1' },
      status: 'pending' as const,
      attempts: 0,
      last_error: null,
      error_code: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      next_attempt_at: 0,
    }
    await db.put('pendingTransactions', legacy as unknown as PendingTransaction)
    expect((await listPendingForUser('u1')).map((i) => i.client_id)).toEqual(['legacy-1'])
    expect((await listPendingForUser('u2')).map((i) => i.client_id)).toEqual(['legacy-1'])

    // Offline drain: nothing posted, but ownership is assigned.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await syncManager.syncNow({ force: true })
    const [item] = await listPending()
    expect(item?.user_id).toBe('u1')
    expect(await listPendingForUser('u2')).toEqual([])
    expect(await claimOrphanedPending('u1')).toBe(0)
  })
})
