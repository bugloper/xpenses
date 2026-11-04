import type { ApiErrorBody, Envelope, Paginated } from '@/types/api'

export const API_BASE = '/api/v1'

/** Typed error raised for every non-2xx response or transport failure. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, string>
  readonly requestId: string | undefined
  /** True when the request never reached the server (offline, DNS, abort). */
  readonly isNetwork: boolean

  constructor(init: {
    status: number
    code: string
    message: string
    details?: Record<string, string>
    requestId?: string
    isNetwork?: boolean
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.details = init.details ?? {}
    this.requestId = init.requestId
    this.isNetwork = init.isNetwork ?? false
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
  if (body?.error) {
    return new ApiError({
      status: res.status,
      code: body.error.code || `http_${res.status}`,
      message: body.error.message || res.statusText || 'Request failed',
      details: body.error.details,
      requestId,
    })
  }
  return new ApiError({
    status: res.status,
    code: `http_${res.status}`,
    message: res.statusText || `Request failed with status ${res.status}`,
    requestId,
  })
}

/** Signals the offline sync manager that the server is reachable. */
function notifyRequestOk() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('xpensiv:request-ok'))
}

/** Core fetch wrapper: JSON in/out, `{data}` envelope unwrapped, errors typed. */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers }
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
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
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
  if (!res.ok) throw await errorFromResponse(res)
  notifyRequestOk()
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<Envelope<T>>(path, { signal }).then((r) => r.data),
  getPage: <T>(path: string, signal?: AbortSignal) => request<Paginated<T>>(path, { signal }),
  post: <T>(path: string, body?: unknown) =>
    request<Envelope<T>>(path, { method: 'POST', body }).then((r) => r.data),
  postForm: <T>(path: string, form: FormData) =>
    request<Envelope<T>>(path, { method: 'POST', form }).then((r) => r.data),
  patch: <T>(path: string, body: unknown) =>
    request<Envelope<T>>(path, { method: 'PATCH', body }).then((r) => r.data),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
}

/** Downloads a file from the API (CSV export, backup) by streaming it into a Blob. */
export async function downloadFile(path: string, fallbackName: string, headers?: Record<string, string>) {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { headers })
  } catch {
    throw new ApiError({
      status: 0,
      code: 'network_error',
      message: 'Could not reach the server',
      isNetwork: true,
    })
  }
  if (!res.ok) throw await errorFromResponse(res)
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
