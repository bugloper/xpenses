import { Outlet, createRootRoute, createRoute, redirect } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorState } from '@/components/common/States'
import { Toaster } from '@/components/ui/sonner'
import { isApiError, isNetworkError } from '@/lib/api'
import { adoptUser, authStore, resolveAuthRedirect } from '@/lib/auth'
import { authKeys, authStatusQuery, meQuery } from '@/lib/queries/auth'
import { queryClient } from '@/lib/queryClient'
import type { AuthStatus, User } from '@/types/api'

export type AuthContext = { user: User | null; status: AuthStatus | null }

/**
 * Resolves `/auth/status` (+ `/auth/me` when authenticated). Both are cached in
 * the query client (5 min), so within-app navigations do not hit the network.
 *
 * Offline (status fetch fails before reaching the server) we trust the
 * persisted `/auth/me`: the app shell renders with cached data and the offline
 * queue keeps its owner. Without a cached user the guard behaves as signed out.
 */
async function resolveAuth(): Promise<AuthContext> {
  let status: AuthStatus
  try {
    status = await queryClient.fetchQuery(authStatusQuery())
  } catch (e) {
    if (!isNetworkError(e)) throw e
    const cached = queryClient.getQueryData<User>(authKeys.me) ?? authStore.get().user
    await adoptUser(cached)
    return { user: cached, status: null }
  }
  let user: User | null = null
  if (status.authenticated) {
    try {
      user = await queryClient.fetchQuery(meQuery())
    } catch (e) {
      if (isApiError(e) && (e.status === 401 || e.status === 403)) {
        status = { ...status, authenticated: false }
        queryClient.setQueryData(authKeys.status, status)
      } else if (isNetworkError(e)) {
        user = queryClient.getQueryData<User>(authKeys.me) ?? authStore.get().user
      } else {
        throw e
      }
    }
  }
  await adoptUser(user)
  return { user, status }
}

export const rootRoute = createRootRoute({
  beforeLoad: async ({ location }) => {
    const auth = await resolveAuth()
    const target = resolveAuthRedirect({
      setup_required: auth.status?.setup_required ?? false,
      authenticated: auth.user !== null,
      isAdmin: auth.user?.role === 'admin',
      path: location.pathname,
    })
    if (target) {
      if (target.to === '/login') throw redirect({ to: '/login', search: target.search ?? {} })
      throw redirect({ to: target.to })
    }
    return { auth }
  },
  component: () => (
    <>
      <Outlet />
      <Toaster position="top-center" richColors closeButton />
    </>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="p-6">
      <ErrorState error={error} onRetry={reset} />
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-6">
      <ErrorState error={new Error('This page does not exist.')} title="Not found" />
    </div>
  ),
})

/** Pathless layout: everything that needs a session renders inside the app shell. */
export const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppShell,
})
