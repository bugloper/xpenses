import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Budget } from '@/types/api'
import { keys } from './keys'

export function useBudgets() {
  return useQuery({
    queryKey: keys.budgets.all,
    queryFn: ({ signal }) => api.get<Budget[]>('/budgets', signal),
  })
}

export function useUpsertBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, category_id, amount }: { id?: string; category_id: string; amount: number }) => {
      if (id) return api.patch<Budget>(`/budgets/${id}`, { amount })
      return api.post<Budget>('/budgets', { category_id, amount })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.budgets.all })
      void qc.invalidateQueries({ queryKey: keys.reports.all })
    },
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/budgets/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.budgets.all })
      void qc.invalidateQueries({ queryKey: keys.reports.all })
    },
  })
}
