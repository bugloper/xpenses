import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  AdjustmentResult,
  BankLineRequest,
  CreateFromBankRequest,
  MarkTransferRequest,
  MatchRequest,
  Reconciliation,
  TransferResult,
  Workspace,
} from '@/types/api'
import { keys, reconciliationDependentKeys } from './keys'

export function useReconciliationWorkspace(statementId: string) {
  return useQuery({
    queryKey: keys.reconciliation.workspace(statementId),
    queryFn: ({ signal }) => api.get<Workspace>(`/reconciliation/${statementId}`, signal),
    enabled: !!statementId,
  })
}

function useInvalidateReconciliation() {
  const qc = useQueryClient()
  return () => {
    for (const k of reconciliationDependentKeys) void qc.invalidateQueries({ queryKey: k })
  }
}

export function useAutoMatch() {
  const invalidate = useInvalidateReconciliation()
  return useMutation({
    mutationFn: (statement_id: string) =>
      api.post<{ matched: number }>('/reconciliation/auto-match', { statement_id }),
    onSuccess: invalidate,
  })
}

export function useMatchBankLine() {
  const invalidate = useInvalidateReconciliation()
  return useMutation({
    mutationFn: (body: MatchRequest) => api.post<Reconciliation>('/reconciliation/match', body),
    onSuccess: invalidate,
  })
}

export function useUnmatchBankLine() {
  const invalidate = useInvalidateReconciliation()
  return useMutation({
    mutationFn: (bank_transaction_id: string) =>
      api.post<void>('/reconciliation/unmatch', { bank_transaction_id }),
    onSuccess: invalidate,
  })
}

export function useIgnoreBankLine() {
  const invalidate = useInvalidateReconciliation()
  return useMutation({
    mutationFn: (body: BankLineRequest) => api.post<Reconciliation>('/reconciliation/ignore', body),
    onSuccess: invalidate,
  })
}

export function useMarkTransfer() {
  const invalidate = useInvalidateReconciliation()
  return useMutation({
    mutationFn: (body: MarkTransferRequest) => api.post<TransferResult>('/reconciliation/transfer', body),
    onSuccess: invalidate,
  })
}

export function useCreateFromBankLine() {
  const invalidate = useInvalidateReconciliation()
  return useMutation({
    mutationFn: (body: CreateFromBankRequest) =>
      api.post<TransferResult>('/reconciliation/create-transaction', body),
    onSuccess: invalidate,
  })
}

export function useMatchWithAdjustment() {
  const invalidate = useInvalidateReconciliation()
  return useMutation({
    mutationFn: (body: MatchRequest) => api.post<AdjustmentResult>('/reconciliation/adjustment', body),
    onSuccess: invalidate,
  })
}
