import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, toQuery } from '@/lib/api'
import type { Account, AccountUsage, CreateAccountRequest, UpdateAccountRequest } from '@/types/api'
import { keys } from './keys'

export function useAccounts(includeInactive = false) {
  return useQuery({
    queryKey: keys.accounts.list(includeInactive),
    queryFn: ({ signal }) =>
      api.get<Account[]>(`/accounts${toQuery({ include_inactive: includeInactive })}`, signal),
  })
}

export function useAccount(id: string) {
  return useQuery({
    queryKey: keys.accounts.detail(id),
    queryFn: ({ signal }) => api.get<Account>(`/accounts/${id}`, signal),
    enabled: !!id,
  })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateAccountRequest) => api.post<Account>('/accounts', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.accounts.all })
      // The opening balance feeds the dashboard total and the accounts report.
      void qc.invalidateQueries({ queryKey: keys.reports.all })
    },
  })
}

export function useUpdateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateAccountRequest & { id: string }) =>
      api.patch<Account>(`/accounts/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.accounts.all })
      void qc.invalidateQueries({ queryKey: keys.reports.all })
      // Name/currency are denormalised onto transaction rows.
      void qc.invalidateQueries({ queryKey: keys.transactions.all })
    },
  })
}

/** What still uses an account; only an unused one can be deleted. Fetched when `enabled`. */
export function useAccountUsage(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...keys.accounts.detail(id), 'usage'],
    queryFn: ({ signal }) => api.get<AccountUsage>(`/accounts/${id}/usage`, signal),
    enabled: enabled && !!id,
    staleTime: 0,
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/accounts/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.accounts.all })
      void qc.invalidateQueries({ queryKey: keys.reports.all })
    },
  })
}
