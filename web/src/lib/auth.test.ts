import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import {
  API_RUNTIME_CACHE,
  LAST_USER_STORAGE_KEY,
  adoptUser,
  authErrorInfo,
  authStore,
  initials,
  parseLoginSearch,
  parseRegisterSearch,
  purgeSessionData,
  resolveAuthRedirect,
  safeRedirect,
  type GuardInput,
  type GuardRedirect,
} from './auth'
import { LAST_USED_STORAGE_KEY, getLastUsed, setLastUsed } from './last-used'
import { QUERY_CACHE_STORAGE_KEY, queryClient } from './queryClient'
import type { User } from '@/types/api'

const user = (over: Partial<User> = {}): User => ({
  id: 'u1',
  name: 'Nima Yonten',
  email: 'nima@example.com',
  role: 'user',
  is_active: true,
  created_at: '',
  last_login_at: null,
  ...over,
})

describe('resolveAuthRedirect', () => {
  const cases: Array<[string, GuardInput, GuardRedirect | null]> = [
    [
      'setup required: app → /setup',
      { setup_required: true, authenticated: false, path: '/', isAdmin: false },
      { to: '/setup' },
    ],
    [
      'setup required: /login → /setup',
      { setup_required: true, authenticated: false, path: '/login', isAdmin: false },
      { to: '/setup' },
    ],
    [
      'setup required: /setup stays',
      { setup_required: true, authenticated: false, path: '/setup', isAdmin: false },
      null,
    ],
    [
      'set up, signed out: /setup → /login',
      { setup_required: false, authenticated: false, path: '/setup', isAdmin: false },
      { to: '/login' },
    ],
    [
      'set up, signed in: /setup → /',
      { setup_required: false, authenticated: true, path: '/setup', isAdmin: true },
      { to: '/' },
    ],
    [
      'signed out: / → /login without redirect',
      { setup_required: false, authenticated: false, path: '/', isAdmin: false },
      { to: '/login' },
    ],
    [
      'signed out: deep link keeps the path',
      { setup_required: false, authenticated: false, path: '/transactions/abc', isAdmin: false },
      { to: '/login', search: { redirect: '/transactions/abc' } },
    ],
    [
      'signed out: /login stays',
      { setup_required: false, authenticated: false, path: '/login', isAdmin: false },
      null,
    ],
    [
      'signed out: /register stays',
      { setup_required: false, authenticated: false, path: '/register', isAdmin: false },
      null,
    ],
    [
      'signed in: /login → /',
      { setup_required: false, authenticated: true, path: '/login', isAdmin: false },
      { to: '/' },
    ],
    [
      'signed in: /register → /',
      { setup_required: false, authenticated: true, path: '/register', isAdmin: false },
      { to: '/' },
    ],
    [
      'signed in: app stays',
      { setup_required: false, authenticated: true, path: '/settings', isAdmin: false },
      null,
    ],
    [
      'user: /admin → /',
      { setup_required: false, authenticated: true, path: '/admin', isAdmin: false },
      { to: '/' },
    ],
    [
      'user: /admin/x → /',
      { setup_required: false, authenticated: true, path: '/admin/users', isAdmin: false },
      { to: '/' },
    ],
    [
      'admin: /admin stays',
      { setup_required: false, authenticated: true, path: '/admin', isAdmin: true },
      null,
    ],
    [
      'signed out: /admin → /login?redirect',
      { setup_required: false, authenticated: false, path: '/admin', isAdmin: false },
      { to: '/login', search: { redirect: '/admin' } },
    ],
  ]
  it.each(cases)('%s', (_name, input, expected) => {
    expect(resolveAuthRedirect(input)).toEqual(expected)
  })
})

describe('search helpers', () => {
  it('safeRedirect only allows in-app non-auth paths', () => {
    expect(safeRedirect('/transactions?page=2')).toBe('/transactions?page=2')
    expect(safeRedirect(undefined)).toBe('/')
    expect(safeRedirect('')).toBe('/')
    expect(safeRedirect('https://evil.example')).toBe('/')
    expect(safeRedirect('//evil.example')).toBe('/')
    expect(safeRedirect('/login')).toBe('/')
    expect(safeRedirect('/setup?x=1')).toBe('/')
  })
  it('parses ?redirect= and ?invite=', () => {
    expect(parseLoginSearch({ redirect: '/x' })).toEqual({ redirect: '/x' })
    expect(parseLoginSearch({ redirect: 3 })).toEqual({})
    expect(parseLoginSearch({})).toEqual({})
    expect(parseRegisterSearch({ invite: 'tok' })).toEqual({ invite: 'tok' })
    expect(parseRegisterSearch({ invite: '' })).toEqual({})
  })
  it('initials', () => {
    expect(initials('Nima Yonten')).toBe('NY')
    expect(initials('nima')).toBe('N')
    expect(initials('  ')).toBe('?')
  })
})

describe('authErrorInfo', () => {
  const err = (status: number, code: string, details?: Record<string, string>, retryAfter?: number) =>
    new ApiError({ status, code, message: code, details, retryAfter })
  it('maps every contract code', () => {
    expect(authErrorInfo(err(401, 'invalid_credentials'))).toMatchObject({ field: 'password' })
    expect(authErrorInfo(err(403, 'account_disabled')).message).toMatch(/disabled/)
    expect(authErrorInfo(err(403, 'setup_required')).setupRequired).toBe(true)
    expect(authErrorInfo(err(409, 'already_set_up')).alreadySetUp).toBe(true)
    expect(authErrorInfo(err(403, 'registration_closed')).message).toMatch(/closed/)
    expect(authErrorInfo(err(400, 'invalid_invite')).message).toMatch(/invite/)
    expect(authErrorInfo(err(409, 'email_taken'))).toMatchObject({ field: 'email' })
  })
  it('too_many_attempts prefers details.retry_after, then the header', () => {
    expect(authErrorInfo(err(429, 'too_many_attempts', { retry_after: '90' }))).toMatchObject({
      retryAfter: 90,
      message: 'Too many attempts. Try again in 90 seconds.',
    })
    expect(authErrorInfo(err(429, 'too_many_attempts', undefined, 7)).retryAfter).toBe(7)
    expect(authErrorInfo(err(429, 'too_many_attempts')).message).toMatch(/few minutes/)
  })
  it('network errors say offline', () => {
    expect(
      authErrorInfo(new ApiError({ status: 0, code: 'network_error', message: 'x', isNetwork: true }))
        .message,
    ).toMatch(/offline/)
  })
})

describe('purgeSessionData', () => {
  let deleted: string[]
  beforeEach(() => {
    deleted = []
    localStorage.clear()
    sessionStorage.clear()
    queryClient.clear()
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { delete: vi.fn(async (name: string) => (deleted.push(name), true)) },
    })
  })
  afterEach(() => {
    // @ts-expect-error test cleanup of the mock
    delete globalThis.caches
    authStore.setUser(null)
  })

  it('clears the query caches, the runtime cache and id-bearing prefs, keeps the theme', async () => {
    queryClient.setQueryData(['accounts', 'list'], [{ id: 'a1' }])
    localStorage.setItem(QUERY_CACHE_STORAGE_KEY, '{"clientState":{}}')
    localStorage.setItem('xpensiv-theme', 'light')
    localStorage.setItem(LAST_USER_STORAGE_KEY, 'u1')
    setLastUsed('expense', { account_id: 'a1', category_id: 'c1' })
    sessionStorage.setItem('unrelated', 'keep')
    authStore.setUser(user())

    await purgeSessionData()

    expect(queryClient.getQueryData(['accounts', 'list'])).toBeUndefined()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(localStorage.getItem(QUERY_CACHE_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(LAST_USED_STORAGE_KEY)).toBeNull()
    expect(getLastUsed('expense')).toEqual({})
    expect(localStorage.getItem(LAST_USER_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem('xpensiv-theme')).toBe('light')
    expect(sessionStorage.getItem('unrelated')).toBe('keep')
    expect(deleted).toEqual([API_RUNTIME_CACHE])
    expect(authStore.get().user).toBeNull()
  })

  it('works where the Cache API is missing', async () => {
    // @ts-expect-error simulate an environment without caches
    delete globalThis.caches
    await expect(purgeSessionData()).resolves.toBeUndefined()
  })

  it('adoptUser purges when a different user signs in on the same device', async () => {
    await adoptUser(user({ id: 'u1' }))
    queryClient.setQueryData(['transactions', 'list'], [{ id: 't-of-u1' }])
    setLastUsed('expense', { account_id: 'a-of-u1' })
    await adoptUser(user({ id: 'u2', name: 'Other' }))
    expect(queryClient.getQueryData(['transactions', 'list'])).toBeUndefined()
    expect(getLastUsed('expense')).toEqual({})
    expect(deleted).toEqual([API_RUNTIME_CACHE])
    expect(authStore.get().user?.id).toBe('u2')
    expect(localStorage.getItem(LAST_USER_STORAGE_KEY)).toBe('u2')
  })

  it('adoptUser keeps caches for the same user', async () => {
    await adoptUser(user({ id: 'u1' }))
    queryClient.setQueryData(['transactions', 'list'], [{ id: 't' }])
    await adoptUser(user({ id: 'u1', name: 'Renamed' }))
    expect(queryClient.getQueryData(['transactions', 'list'])).toEqual([{ id: 't' }])
    expect(deleted).toEqual([])
    expect(authStore.get().user?.name).toBe('Renamed')
  })
})
