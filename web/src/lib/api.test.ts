import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  CSRF_REJECTED_EVENT,
  UNAUTHENTICATED_EVENT,
  api,
  errorMessage,
  isNetworkError,
  toQuery,
} from './api'

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
    // POST /auth/logout answers 204 No Content.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    await expect(api.post('/auth/logout', {})).resolves.toBeUndefined()
    await expect(api.patch('/x', {})).resolves.toBeUndefined()
  })
})

describe('auth behaviour', () => {
  const user = {
    id: 'u1',
    name: 'N',
    email: 'n@x',
    role: 'user',
    is_active: true,
    created_at: '',
    last_login_at: null,
  }

  it('sends X-Xpensiv-Client: web and same-origin credentials on every request', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify({ data: user }), { status: 200 }))
    await api.get('/auth/me')
    await api.post('/transactions', { amount: 1 })
    await api.patch('/auth/me', { name: 'x' })
    await api.delete('/auth/sessions/1')
    await api.postForm('/restore', new FormData())
    expect(fetchSpy).toHaveBeenCalledTimes(5)
    for (const [, init] of fetchSpy.mock.calls) {
      const headers = init?.headers as Record<string, string>
      expect(headers['X-Xpensiv-Client']).toBe('web')
      expect(init?.credentials).toBe('same-origin')
    }
  })

  it('emits the unauthenticated event exactly once per 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'unauthenticated', message: 'sign in' } }), {
        status: 401,
      }),
    )
    const handler = vi.fn()
    window.addEventListener(UNAUTHENTICATED_EVENT, handler)
    const err = (await api.get('/transactions').catch((e: unknown) => e)) as ApiError
    expect(err.status).toBe(401)
    expect(err.isUnauthenticated).toBe(true)
    expect(handler).toHaveBeenCalledTimes(1)
    await api.delete('/transactions/1').catch(() => undefined)
    expect(handler).toHaveBeenCalledTimes(2)
    window.removeEventListener(UNAUTHENTICATED_EVENT, handler)
  })

  it('does not emit the event for a 401 from /auth/login or /auth/password', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'invalid_credentials', message: 'nope' } }), {
        status: 401,
      }),
    )
    const handler = vi.fn()
    window.addEventListener(UNAUTHENTICATED_EVENT, handler)
    const err = (await api
      .post('/auth/login', { email: 'a', password: 'b' })
      .catch((e: unknown) => e)) as ApiError
    expect(err.code).toBe('invalid_credentials')
    await api.patch('/auth/password', {}).catch(() => undefined)
    expect(handler).not.toHaveBeenCalled()
    window.removeEventListener(UNAUTHENTICATED_EVENT, handler)
  })

  it('treats 403 account_disabled as a lost session, and 403 csrf_rejected as a bug', async () => {
    const auth = vi.fn()
    const csrf = vi.fn()
    window.addEventListener(UNAUTHENTICATED_EVENT, auth)
    window.addEventListener(CSRF_REJECTED_EVENT, csrf)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'account_disabled', message: 'disabled' } }), {
        status: 403,
      }),
    )
    await api.get('/accounts').catch(() => undefined)
    expect(auth).toHaveBeenCalledTimes(1)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'csrf_rejected', message: 'no header' } }), {
        status: 403,
      }),
    )
    await api.post('/accounts', {}).catch(() => undefined)
    expect(csrf).toHaveBeenCalledTimes(1)
    expect(auth).toHaveBeenCalledTimes(1)
    window.removeEventListener(UNAUTHENTICATED_EVENT, auth)
    window.removeEventListener(CSRF_REJECTED_EVENT, csrf)
  })

  it('reads Retry-After into the error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'too_many_attempts', message: 'slow down' } }), {
        status: 429,
        headers: { 'Retry-After': '42' },
      }),
    )
    const err = (await api.post('/auth/login', {}).catch((e: unknown) => e)) as ApiError
    expect(err.retryAfter).toBe(42)
  })

  it('getLoose accepts enveloped and bare bodies', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ setup_required: false, registration_open: true, authenticated: false })),
    )
    expect(await api.getLoose<{ registration_open: boolean }>('/auth/status')).toMatchObject({
      registration_open: true,
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: 's1' }] })),
    )
    expect(await api.getLoose<{ id: string }[]>('/auth/sessions')).toEqual([{ id: 's1' }])
  })
})
