import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Payee } from '@/types/api'
import { keys } from './keys'

/** Distinct payees from the user's own transactions, most used first. */
export function usePayees() {
  return useQuery({
    queryKey: keys.payees.all,
    queryFn: ({ signal }) => api.get<Payee[]>('/payees', signal),
    staleTime: 60_000,
  })
}
