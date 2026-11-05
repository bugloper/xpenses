import type { ApiErrorBody, Envelope, Paginated } from '@/types/api'

export const API_BASE = '/api/v1'

/** Sent on every request; the server rejects mutations without it (CSRF, see docs/AUTH.md). */
export const CLIENT_HEADER = 'X-Xpenses-Client'
export const CLIENT_HEADER_VALUE = 'web'

/** Dispatched on `window` when the server answers 401 to a request that should have had a session. */
export const UNAUTHENTICATED_EVENT = 'xpenses:unauthenticated'
/** Dispatched on `window` when the server answers 403 csrf_rejected (a client bug, never expected). */
export const CSRF_REJECTED_EVENT = 'xpenses:csrf-rejected'

/**
 * Auth endpoints whose 401/403 is part of the normal flow (wrong password, disabled
 * account on login) rather than an expired session. A 401 from these never logs out.
 */
const AUTH_FLOW_PATHS = new Set([
  '/auth/login',
  '/auth/setup',
  '/auth/register',
  '/auth/password',
  '/auth/status',
])

/** Typed error raised for every non-2xx response or transport failure. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, string>
  readonly requestId: string | undefined
  /** True when the request never reached the server (offline, DNS, abort). */
  readonly isNetwork: boolean
  /** Seconds from the `Retry-After` header (429 too_many_attempts). */
  readonly retryAfter: number | undefined

  constructor(init: {
    status: number
    code: string
    message: string
    details?: Record<string, string>
    requestId?: string
    isNetwork?: boolean
    retryAfter?: number
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.details = init.details ?? {}
    this.requestId = init.requestId
    this.isNetwork = init.isNetwork ?? false
    this.retryAfter = init.retryAfter
  }

  get isNotFound() {
    return this.status === 404
  }
  get isValidation() {
    return this.status === 422 || this.status === 400
  }
  get isConflict() {
    return this.status === 409
  }
  get isUnauthenticated() {
    return this.status === 401
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}

export function isNetworkError(e: unknown): boolean {
  return isApiError(e) && e.isNetwork
}

/** Builds a query string from a flat object, skipping undefined/empty values. */
export function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    if (typeof v === 'boolean') {
      if (v) qs.set(k, '1')
      continue
    }
    qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  /** Raw body (FormData) - skips JSON encoding. */
  form?: FormData
}

/** Parses an error response body into an ApiError, tolerating non-JSON bodies. */
export async function errorFromResponse(res: Response): Promise<ApiError> {
  const body = await res
    .json()
    .then((b) => b as ApiErrorBody)
    .catch(() => null)
  const requestId = res.headers.get('x-request-id') ?? body?.error?.request_id ?? undefined
  const retryHeader = res.headers.get('retry-after')
  const retryAfter = retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : undefined
  if (body?.error) {
    return new ApiError({
      status: res.status,
      code: body.error.code || `http_${res.status}`,
      message: body.error.message || res.statusText || 'Request failed',
      details: body.error.details,
      requestId,
      retryAfter,
    })
  }
  return new ApiError({
    status: res.status,
    code: `http_${res.status}`,
    message: res.statusText || `Request failed with status ${res.status}`,
    requestId,
    retryAfter,
  })
}

/** Signals the offline sync manager that the server is reachable. */
function notifyRequestOk() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('xpenses:request-ok'))
}

/** Fired when a request failed at the transport level: the sync manager treats it as being offline. */
export const REQUEST_FAILED_EVENT = 'xpenses:request-failed'
export function notifyRequestFailed() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REQUEST_FAILED_EVENT))
}

/**
 * Turns a session-level failure into a window event. A 401 on an auth-flow endpoint
 * (wrong password, wrong current password) is an ordinary error for the form.
 * `403 account_disabled` is treated like a lost session: the server has already
 * revoked it, so the client state is stale and must be purged.
 */
function notifyAuthFailure(path: string, err: ApiError) {
  if (typeof window === 'undefined') return
  const basePath = path.split('?')[0] ?? path
  if (err.status === 403 && err.code === 'csrf_rejected') {
    window.dispatchEvent(new CustomEvent(CSRF_REJECTED_EVENT, { detail: err }))
    return
  }
  if (AUTH_FLOW_PATHS.has(basePath)) return
  const lostSession = err.status === 401 || (err.status === 403 && err.code === 'account_disabled')
  if (lostSession) window.dispatchEvent(new CustomEvent(UNAUTHENTICATED_EVENT, { detail: err }))
}

function baseHeaders(extra?: Record<string, string>): Record<string, string> {
  return { Accept: 'application/json', [CLIENT_HEADER]: CLIENT_HEADER_VALUE, ...extra }
}

/** Core fetch wrapper: JSON in/out, `{data}` envelope unwrapped, errors typed. */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers = baseHeaders(opts.headers)
  const body: BodyInit | undefined =
    opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined)
  if (!opts.form && opts.body !== undefined) headers['Content-Type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body,
      signal: opts.signal,
      credentials: 'same-origin',
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    notifyRequestFailed()
    throw new ApiError({
      status: 0,
      code: 'network_error',
      message:
        typeof navigator !== 'undefined' && !navigator.onLine
          ? 'You are offline'
          : 'Could not reach the server',
      isNetwork: true,
    })
  }
  if (!res.ok) {
    const err = await errorFromResponse(res)
    notifyAuthFailure(path, err)
    throw err
  }
  notifyRequestOk()
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

/**
 * Unwraps `{data}`; a 204 / empty body (e.g. POST /auth/logout)
 * resolves to undefined instead of throwing on `undefined.data`.
 */
function unwrap<T>(r: Envelope<T> | undefined): T {
  return r === undefined ? (undefined as T) : r.data
}

/**
 * Like `unwrap` but tolerates a bare body. docs/AUTH.md shows `/auth/status`,
 * `/auth/sessions` and the `/admin/*` lists without the `{data}` envelope while
 * the user-returning routes have it; this accepts either.
 */
function unwrapLoose<T>(r: unknown): T {
  if (r && typeof r === 'object' && !Array.isArray(r) && 'data' in r) {
    const keys = Object.keys(r)
    if (keys.length === 1 || (keys.length === 2 && 'meta' in r)) return (r as Envelope<T>).data
  }
  return r as T
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<Envelope<T>>(path, { signal }).then(unwrap),
  getPage: <T>(path: string, signal?: AbortSignal) => request<Paginated<T>>(path, { signal }),
  post: <T>(path: string, body?: unknown) =>
    request<Envelope<T>>(path, { method: 'POST', body }).then(unwrap),
  postForm: <T>(path: string, form: FormData) =>
    request<Envelope<T>>(path, { method: 'POST', form }).then(unwrap),
  patch: <T>(path: string, body: unknown) =>
    request<Envelope<T>>(path, { method: 'PATCH', body }).then(unwrap),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
  /** Envelope-tolerant variants for the auth/admin routes (see `unwrapLoose`). */
  getLoose: <T>(path: string, signal?: AbortSignal) =>
    request<unknown>(path, { signal }).then(unwrapLoose<T>),
  postLoose: <T>(path: string, body?: unknown) =>
    request<unknown>(path, { method: 'POST', body }).then(unwrapLoose<T>),
  patchLoose: <T>(path: string, body: unknown) =>
    request<unknown>(path, { method: 'PATCH', body }).then(unwrapLoose<T>),
}

/** Downloads a file from the API (CSV export, backup) by streaming it into a Blob. */
export async function downloadFile(path: string, fallbackName: string, headers?: Record<string, string>) {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: baseHeaders(headers), credentials: 'same-origin' })
  } catch {
    notifyRequestFailed()
    throw new ApiError({
      status: 0,
      code: 'network_error',
      message: 'Could not reach the server',
      isNetwork: true,
    })
  }
  if (!res.ok) {
    const err = await errorFromResponse(res)
    notifyAuthFailure(path, err)
    throw err
  }
  const blob = await res.blob()
  const cd = res.headers.get('content-disposition') ?? ''
  const match = /filename="?([^";]+)"?/.exec(cd)
  const name = match?.[1] ?? fallbackName
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return name
}

/** Human-readable message for toasts. */
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (isApiError(e)) {
    const detail = Object.entries(e.details)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')
    return detail ? `${e.message}: ${detail}` : e.message
  }
  if (e instanceof Error) return e.message || fallback
  return fallback
}
