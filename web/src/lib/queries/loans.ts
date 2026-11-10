import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CreateLoanRequest, Loan, UpdateLoanRequest } from '@/types/api'
import { keys, transactionDependentKeys } from './keys'

export function useLoans() {
  return useQuery({
    queryKey: keys.loans.all,
    queryFn: ({ signal }) => api.get<Loan[]>('/loans', signal),
  })
}

export function useLoan(id: string) {
  return useQuery({
    queryKey: keys.loans.detail(id),
    queryFn: ({ signal }) => api.get<Loan>(`/loans/${id}`, signal),
    enabled: !!id,
  })
}

/** Records a loan that already exists: what is owed today, no money moving. */
export function useCreateLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateLoanRequest) => api.post<Loan>('/loans', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.loans.all }),
  })
}

export function useUpdateLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateLoanRequest & { id: string }) =>
      api.patch<Loan>(`/loans/${id}`, body),
    // The counterparty's name shows on its transactions.
    onSuccess: () => {
      for (const k of transactionDependentKeys) void qc.invalidateQueries({ queryKey: k })
    },
  })
}

export function useDeleteLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/loans/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.loans.all }),
  })
}
