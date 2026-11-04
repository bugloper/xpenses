import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, toQuery } from '@/lib/api'
import type { Account, CreateAccountRequest, UpdateAccountRequest } from '@/types/api'
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
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.accounts.all }),
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
    },
  })
}
