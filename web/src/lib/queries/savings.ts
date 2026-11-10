import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { SavingsGoal, SavingsGoalDetail, SavingsGoalEntryRequest, SavingsGoalRequest } from '@/types/api'
import { keys, transactionDependentKeys } from './keys'

export function useSavingsGoals() {
  return useQuery({
    queryKey: keys.savings.all,
    queryFn: ({ signal }) => api.get<SavingsGoal[]>('/savings-goals', signal),
  })
}

export function useSavingsGoal(id: string) {
  return useQuery({
    queryKey: keys.savings.detail(id),
    queryFn: ({ signal }) => api.get<SavingsGoalDetail>(`/savings-goals/${id}`, signal),
    enabled: !!id,
  })
}

export function useSaveGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: SavingsGoalRequest & { id?: string }) =>
      id
        ? api.patch<SavingsGoalDetail>(`/savings-goals/${id}`, body)
        : api.post<SavingsGoalDetail>('/savings-goals', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.savings.all }),
  })
}

export function useDeleteGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/savings-goals/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.savings.all }),
  })
}

/** Contributes to or withdraws from a goal; may move money by a transfer, so balances refresh too. */
export function useAddGoalEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ goalId, ...body }: SavingsGoalEntryRequest & { goalId: string }) =>
      api.post<SavingsGoalDetail>(`/savings-goals/${goalId}/entries`, body),
    onSuccess: () => {
      for (const k of transactionDependentKeys) void qc.invalidateQueries({ queryKey: k })
    },
  })
}

export function useDeleteGoalEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ goalId, entryId }: { goalId: string; entryId: string }) =>
      api.delete(`/savings-goals/${goalId}/entries/${entryId}`),
    onSuccess: () => {
      for (const k of transactionDependentKeys) void qc.invalidateQueries({ queryKey: k })
    },
  })
}
