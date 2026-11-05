import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isApiError } from '@/lib/api'
import { adoptUser, purgeSessionData } from '@/lib/auth'
import { queryClient } from '@/lib/queryClient'
import type {
  AdminSettings,
  AdminUser,
  AuthSession,
  AuthStatus,
  ChangePasswordRequest,
  CreateInviteRequest,
  CreatedInvite,
  CreatedPasswordReset,
  Invite,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  SetupRequest,
  UpdateAdminUserRequest,
  UpdateProfileRequest,
  User,
} from '@/types/api'

export const authKeys = {
  all: ['auth'] as const,
  status: ['auth', 'status'] as const,
  me: ['auth', 'me'] as const,
  sessions: ['auth', 'sessions'] as const,
}
export const adminKeys = {
  all: ['admin'] as const,
  users: ['admin', 'users'] as const,
  settings: ['admin', 'settings'] as const,
  invites: ['admin', 'invites'] as const,
}

const FIVE_MINUTES = 5 * 60_000

/**
 * `/auth/status`: fetched once per app load (never persisted) and reused for
 * every navigation within 5 minutes. No retries: offline must fail fast so the
 * guard can fall back to the cached user.
 */
export const authStatusQuery = () =>
  queryOptions({
    queryKey: authKeys.status,
    queryFn: ({ signal }) => api.getLoose<AuthStatus>('/auth/status', signal),
    staleTime: FIVE_MINUTES,
    retry: false,
    meta: { persist: false },
  })

/** `/auth/me`: persisted so the signed-in user is known offline (queue ownership). */
export const meQuery = () =>
  queryOptions({
    queryKey: authKeys.me,
    queryFn: ({ signal }) => api.getLoose<User>('/auth/me', signal),
    staleTime: FIVE_MINUTES,
    retry: false,
  })

export function useAuthStatus() {
  return useQuery(authStatusQuery())
}

export function useMe() {
  return useQuery(meQuery())
}

/** Stores a freshly authenticated user in the cache + store (login/setup/register). */
async function enterSession(user: User) {
  await adoptUser(user)
  queryClient.setQueryData(authKeys.me, user)
  const prev = queryClient.getQueryData<AuthStatus>(authKeys.status)
  queryClient.setQueryData<AuthStatus>(authKeys.status, {
    setup_required: false,
    registration_open: prev?.registration_open ?? false,
    authenticated: true,
  })
}

export function useLogin() {
  return useMutation({
    mutationFn: (body: LoginRequest) => api.postLoose<User>('/auth/login', body),
    onSuccess: (user) => enterSession(user),
  })
}

export function useSetup() {
  return useMutation({
    mutationFn: (body: SetupRequest) => api.postLoose<User>('/auth/setup', body),
    onSuccess: (user) => enterSession(user),
  })
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: RegisterRequest) => api.postLoose<User>('/auth/register', body),
    onSuccess: (user) => enterSession(user),
  })
}

/**
 * Ends the session: tells the server (best effort - offline logout still clears
 * the device), then purges every local trace of the user. Navigation is up to
 * the caller so this stays usable outside React.
 */
export async function performLogout(opts: { everywhere?: boolean } = {}): Promise<void> {
  try {
    await api.postLoose<void>(opts.everywhere ? '/auth/logout-all' : '/auth/logout')
  } catch (e) {
    // 401: the session is already gone server-side - fine. Network: we still log
    // out locally; the server session idles out on its own.
    if (isApiError(e) && !e.isNetwork && e.status !== 401) throw e
  }
  await purgeSessionData()
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateProfileRequest) => api.patchLoose<User>('/auth/me', body),
    onSuccess: (user) => {
      qc.setQueryData(authKeys.me, user)
      void adoptUser(user)
    },
  })
}

export function useChangePassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) => api.patchLoose<void>('/auth/password', body),
    // Every other session was revoked: refresh the list.
    onSuccess: () => void qc.invalidateQueries({ queryKey: authKeys.sessions }),
  })
}

/** Anonymous: spends an admin-issued reset link. */
export function useResetPassword() {
  return useMutation({
    mutationFn: (body: ResetPasswordRequest) => api.postLoose<void>('/auth/reset-password', body),
  })
}

/** Admin: issues a one-time reset link for a user. */
export function useCreatePasswordReset() {
  return useMutation({
    mutationFn: (userId: string) =>
      api.postLoose<CreatedPasswordReset>(`/admin/users/${userId}/password-reset`, {}),
  })
}

export function useSessions() {
  return useQuery({
    queryKey: authKeys.sessions,
    queryFn: ({ signal }) => api.getLoose<AuthSession[]>('/auth/sessions', signal),
    staleTime: 30_000,
    meta: { persist: false },
  })
}

export function useRevokeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: authKeys.sessions }),
  })
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export function useAdminUsers() {
  return useQuery({
    queryKey: adminKeys.users,
    queryFn: ({ signal }) => api.getLoose<AdminUser[]>('/admin/users', signal),
    meta: { persist: false },
  })
}

export function useUpdateAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateAdminUserRequest & { id: string }) =>
      api.patchLoose<User>(`/admin/users/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.users }),
  })
}

export function useDeleteAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.users })
      void qc.invalidateQueries({ queryKey: adminKeys.invites })
    },
  })
}

export function useAdminSettings() {
  return useQuery({
    queryKey: adminKeys.settings,
    queryFn: ({ signal }) => api.getLoose<AdminSettings>('/admin/settings', signal),
    meta: { persist: false },
  })
}

export function useUpdateAdminSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AdminSettings) => api.patchLoose<AdminSettings>('/admin/settings', body),
    onSuccess: (data) => {
      qc.setQueryData(adminKeys.settings, data)
      // The public status mirrors the flag (register link on the login page).
      void qc.invalidateQueries({ queryKey: authKeys.status })
    },
  })
}

export function useInvites() {
  return useQuery({
    queryKey: adminKeys.invites,
    queryFn: ({ signal }) => api.getLoose<Invite[]>('/admin/invites', signal),
    meta: { persist: false },
  })
}

export function useCreateInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateInviteRequest) => api.postLoose<CreatedInvite>('/admin/invites', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.invites }),
  })
}

export function useRevokeInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/invites/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.invites }),
  })
}
