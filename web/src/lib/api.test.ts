import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, errorMessage, isNetworkError, toQuery } from './api'

afterEach(() => vi.restoreAllMocks())

describe('toQuery', () => {
  it('skips empty values and encodes booleans as 1', () => {
    expect(toQuery({ a: 'x', b: undefined, c: '', d: true, e: false, f: 2 })).toBe('?a=x&d=1&f=2')
    expect(toQuery({})).toBe('')
  })
})

describe('request error mapping', () => {
  it('maps the error envelope to ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'validation_error',
            message: 'validation failed',
            details: { amount: 'must not be zero' },
            request_id: 'r1',
          },
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const err = await api.get('/transactions/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    const e = err as ApiError
    expect(e.status).toBe(422)
    expect(e.code).toBe('validation_error')
    expect(e.details.amount).toBe('must not be zero')
    expect(e.requestId).toBe('r1')
    expect(e.isValidation).toBe(true)
    expect(errorMessage(e)).toBe('validation failed: amount must not be zero')
  })

  it('prefers the X-Request-Id header', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json', {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'X-Request-Id': 'hdr' },
      }),
    )
    const e = (await api.get('/x').catch((e: unknown) => e)) as ApiError
    expect(e.status).toBe(500)
    expect(e.code).toBe('http_500')
    expect(e.requestId).toBe('hdr')
  })

  it('maps fetch failures to a network ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const e = (await api.get('/x').catch((e: unknown) => e)) as ApiError
    expect(isNetworkError(e)).toBe(true)
    expect(e.status).toBe(0)
  })

  it('unwraps the data envelope and emits request-ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { id: '1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const handler = vi.fn()
    window.addEventListener('xpensiv:request-ok', handler)
    const data = await api.get<{ id: string }>('/x')
    expect(data.id).toBe('1')
    expect(handler).toHaveBeenCalled()
    window.removeEventListener('xpensiv:request-ok', handler)
  })

  it('handles 204', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    await expect(api.delete('/x')).resolves.toBeUndefined()
  })

  it('resolves POST/PATCH with a 204 (no envelope) to undefined instead of throwing', async () => {
    // POST /reconciliation/unmatch answers 204 No Content.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    await expect(api.post('/reconciliation/unmatch', { bank_transaction_id: 'b1' })).resolves.toBeUndefined()
    await expect(api.patch('/x', {})).resolves.toBeUndefined()
  })
})
