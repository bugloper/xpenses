import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, toQuery } from '@/lib/api'
import type {
  CreateRecurringRequest,
  RecurringRunResult,
  RecurringTransaction,
  UpdateRecurringRequest,
} from '@/types/api'
import { keys, transactionDependentKeys } from './keys'

export function useRecurring() {
  return useQuery({
    queryKey: keys.recurring.all,
    queryFn: ({ signal }) => api.get<RecurringTransaction[]>('/recurring', signal),
  })
}

export function useCreateRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateRecurringRequest) => api.post<RecurringTransaction>('/recurring', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.recurring.all }),
  })
}

export function useUpdateRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateRecurringRequest & { id: string }) =>
      api.patch<RecurringTransaction>(`/recurring/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.recurring.all }),
  })
}

export function useDeleteRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/recurring/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.recurring.all }),
  })
}

export function useRunRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (asOf?: string) => api.post<RecurringRunResult>(`/recurring/run${toQuery({ as_of: asOf })}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.recurring.all })
      for (const k of transactionDependentKeys) void qc.invalidateQueries({ queryKey: k })
    },
  })
}
