// Session state shared by the router guard, the API layer and the offline queue.
//
// The source of truth for "who is signed in" is the `/auth/me` query; this module
// mirrors it into a tiny external store so non-React code (offline queue, sync
// manager) can read the current user id synchronously.
import { useSyncExternalStore } from 'react'
import { isApiError } from './api'
import { clearLastUsed } from './last-used'
import { clearRecentCategories } from '@/lib/recent-categories'
import { QUERY_CACHE_STORAGE_KEY, queryClient, queryPersister } from './queryClient'
import type { User } from '@/types/api'

/** Workbox runtime cache for GET /api/* (see vite.config.ts). */
export const API_RUNTIME_CACHE = 'xpenses-api'
/** Remembers which user the local caches belong to, so a user switch purges them. */
export const LAST_USER_STORAGE_KEY = 'xpenses-last-user'

export const AUTH_PATHS = ['/login', '/setup', '/register'] as const

export function isAuthPath(path: string): boolean {
  return AUTH_PATHS.some((p) => path === p || path.startsWith(p + '/'))
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
type AuthState = { user: User | null }

let state: AuthState = { user: null }
const listeners = new Set<() => void>()

export const authStore = {
  get: (): AuthState => state,
  subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  setUser(user: User | null) {
    if (state.user === user) return
    if (state.user && user && state.user.id === user.id && shallowEqualUser(state.user, user)) return
    state = { user }
    for (const l of listeners) l()
  },
}

function shallowEqualUser(a: User, b: User): boolean {
  return (
    a.name === b.name &&
    a.email === b.email &&
    a.role === b.role &&
    a.is_active === b.is_active &&
    a.last_login_at === b.last_login_at
  )
}

/** Current user id for code outside React (offline queue). `null` when signed out. */
export function currentUserId(): string | null {
  return state.user?.id ?? null
}

export function useAuth(): { user: User | null; isAdmin: boolean; isAuthenticated: boolean } {
  const s = useSyncExternalStore(authStore.subscribe, authStore.get, authStore.get)
  return { user: s.user, isAdmin: s.user?.role === 'admin', isAuthenticated: s.user !== null }
}

// ---------------------------------------------------------------------------
// Local data purge (logout / user switch on a shared device)
// ---------------------------------------------------------------------------
function readLastUser(): string | null {
  try {
    return localStorage.getItem(LAST_USER_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeLastUser(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_USER_STORAGE_KEY, id)
    else localStorage.removeItem(LAST_USER_STORAGE_KEY)
  } catch {
    // storage unavailable
  }
}

/**
 * Drops every piece of locally cached data that belongs to a user:
 * - TanStack in-memory cache and its localStorage persistence
 * - the Workbox runtime cache of GET /api responses
 * - localStorage / sessionStorage prefs that reference ids
 * The theme survives; the offline queue is never touched (items are per-user
 * and stay for their owner).
 */
export async function purgeSessionData(): Promise<void> {
  queryClient.clear()
  try {
    queryPersister.removeClient()
  } catch {
    // persister without storage
  }
  try {
    localStorage.removeItem(QUERY_CACHE_STORAGE_KEY)
  } catch {
    // storage unavailable
  }
  clearLastUsed()
  clearRecentCategories()
  writeLastUser(null)
  if (typeof caches !== 'undefined') {
    try {
      await caches.delete(API_RUNTIME_CACHE)
    } catch {
      // Cache API blocked (private mode) - nothing cached there then
    }
  }
  authStore.setUser(null)
}

/**
 * Makes `user` the signed-in user. When the local caches belong to a different
 * user (shared device, session switched server-side) they are purged first.
 */
export async function adoptUser(user: User | null): Promise<void> {
  const previous = readLastUser()
  if (user === null) {
    authStore.setUser(null)
    return
  }
  if (previous && previous !== user.id) await purgeSessionData()
  writeLastUser(user.id)
  authStore.setUser(user)
}

// ---------------------------------------------------------------------------
// Route guard (pure)
// ---------------------------------------------------------------------------
export type GuardInput = {
  setup_required: boolean
  authenticated: boolean
  /** Pathname being navigated to (no search). */
  path: string
  isAdmin: boolean
}
export type GuardRedirect = { to: '/setup' | '/login' | '/'; search?: { redirect: string } }

/**
 * Decides where a navigation must be redirected, or `null` to let it through.
 * Priority: setup first (nobody can do anything before the first admin exists),
 * then authentication, then role.
 */
export function resolveAuthRedirect(input: GuardInput): GuardRedirect | null {
  const { setup_required, authenticated, path, isAdmin } = input
  if (setup_required) return path === '/setup' ? null : { to: '/setup' }
  if (path === '/setup') return authenticated ? { to: '/' } : { to: '/login' }
  if (!authenticated) {
    if (isAuthPath(path)) return null
    return path === '/' ? { to: '/login' } : { to: '/login', search: { redirect: path } }
  }
  if (isAuthPath(path)) return { to: '/' }
  if ((path === '/admin' || path.startsWith('/admin/')) && !isAdmin) return { to: '/' }
  return null
}

export type LoginSearch = { redirect?: string }
/** `/login?redirect=` search validation. */
export function parseLoginSearch(s: Record<string, unknown>): LoginSearch {
  return typeof s.redirect === 'string' && s.redirect ? { redirect: s.redirect } : {}
}

export type RegisterSearch = { invite?: string }
/** `/register?invite=` search validation. */
export function parseRegisterSearch(s: Record<string, unknown>): RegisterSearch {
  return typeof s.invite === 'string' && s.invite ? { invite: s.invite } : {}
}

/**
 * Validates a `?redirect=` value: only same-app absolute paths, never an auth
 * page (which would bounce back to `/`), never a protocol-relative URL.
 */
export function safeRedirect(target: string | undefined | null): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return '/'
  const path = target.split('?')[0] ?? target
  if (isAuthPath(path)) return '/'
  return target
}

// ---------------------------------------------------------------------------
// Error → message
// ---------------------------------------------------------------------------
export type AuthErrorInfo = {
  message: string
  /** Form field the message belongs to (undefined = form-level). */
  field?: 'email' | 'password' | 'name' | 'current_password' | 'new_password'
  /** Seconds to wait, for too_many_attempts. */
  retryAfter?: number
  /** The server says there is no account yet: the caller should go to /setup. */
  setupRequired?: boolean
  /** The server says the instance is already set up: the caller should go to /login. */
  alreadySetUp?: boolean
}

function retrySeconds(details: Record<string, string>, header: number | undefined): number | undefined {
  const raw = details.retry_after ?? details.retry_after_seconds
  const n = raw !== undefined ? Number(raw) : header
  return n !== undefined && Number.isFinite(n) && n > 0 ? Math.ceil(n) : header
}

/** Maps every error code in docs/AUTH.md to a precise inline message. */
export function authErrorInfo(e: unknown): AuthErrorInfo {
  if (!isApiError(e)) {
    return { message: e instanceof Error && e.message ? e.message : 'Something went wrong. Try again.' }
  }
  if (e.isNetwork) return { message: 'You are offline. Connect to the internet to sign in.' }
  switch (e.code) {
    case 'invalid_credentials':
      return { message: 'Incorrect email or password.', field: 'password' }
    case 'account_disabled':
      return { message: 'This account has been disabled. Contact your administrator.' }
    case 'setup_required':
      return { message: 'No account exists yet. Set up Xpenses first.', setupRequired: true }
    case 'already_set_up':
      return { message: 'Xpenses is already set up. Sign in instead.', alreadySetUp: true }
    case 'too_many_attempts': {
      const secs = retrySeconds(e.details, e.retryAfter)
      return {
        message: secs
          ? `Too many attempts. Try again in ${secs} second${secs === 1 ? '' : 's'}.`
          : 'Too many attempts. Try again in a few minutes.',
        retryAfter: secs,
      }
    }
    case 'registration_closed':
      return { message: 'Registration is closed. Ask the administrator for an invite link.' }
    case 'invalid_invite':
      return { message: 'This invite link is invalid, expired or has already been used.' }
    case 'email_taken':
      return { message: 'An account with this email already exists.', field: 'email' }
    case 'csrf_rejected':
      return {
        message: 'The request was rejected by the server (missing client header). Reload and try again.',
      }
    case 'validation_error': {
      const [field, msg] = Object.entries(e.details)[0] ?? []
      if (field === 'email' || field === 'password' || field === 'name') {
        return { message: msg || 'Invalid value', field }
      }
      if (field === 'current_password' || field === 'new_password')
        return { message: msg || 'Invalid value', field }
      return { message: msg ? `${field}: ${msg}` : e.message }
    }
    default:
      return { message: e.message || 'Something went wrong. Try again.' }
  }
}

/** Initials for the avatar badge: "Nima Yonten" → "NY", "nima" → "N". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase() || '?'
}
