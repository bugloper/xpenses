import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { resetDBForTests } from './db'
import {
  backoffMs,
  enqueueTransaction,
  listPending,
  removePending,
  retryPending,
  updatePending,
} from './queue'
import { syncManager } from './sync'
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
