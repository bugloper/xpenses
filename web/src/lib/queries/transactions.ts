import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, toQuery } from '@/lib/api'
import type { Paginated, Transaction, TransactionFilter, UpdateTransactionRequest } from '@/types/api'
import { keys, transactionDependentKeys } from './keys'

export function transactionsQuery(filter: TransactionFilter): string {
  return `/transactions${toQuery({
    search: filter.search,
    date_from: filter.date_from,
    date_to: filter.date_to,
    category_id: filter.category_id,
    account_id: filter.account_id,
    type: filter.type,
    status: filter.status,
    origin: filter.origin,
    unmatched: filter.unmatched,
    sort: filter.sort,
    order: filter.order,
    page: filter.page,
    per_page: filter.per_page,
  })}`
}

export function useInfiniteTransactions(filter: Omit<TransactionFilter, 'page'>, perPage = 50) {
  return useInfiniteQuery({
    queryKey: keys.transactions.list({ ...filter, per_page: perPage }),
    queryFn: ({ pageParam, signal }) =>
      api.getPage<Transaction>(transactionsQuery({ ...filter, page: pageParam, per_page: perPage }), signal),
    initialPageParam: 1,
    getNextPageParam: (last: Paginated<Transaction>) => {
      const { page, per_page, total } = last.meta
      return page * per_page < total ? page + 1 : undefined
    },
  })
}

export function useTransactions(filter: TransactionFilter) {
  return useQuery({
    queryKey: keys.transactions.list(filter),
    queryFn: ({ signal }) => api.getPage<Transaction>(transactionsQuery(filter), signal),
  })
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: keys.transactions.detail(id),
    queryFn: ({ signal }) => api.get<Transaction>(`/transactions/${id}`, signal),
    enabled: !!id,
  })
}

export function useInvalidateTransactions() {
  const qc = useQueryClient()
  return () => {
    for (const k of transactionDependentKeys) void qc.invalidateQueries({ queryKey: k })
  }
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateTransactionRequest & { id: string }) =>
      api.patch<Transaction>(`/transactions/${id}`, body),
    onSuccess: (tx) => {
      qc.setQueryData(keys.transactions.detail(tx.id), tx)
      for (const k of transactionDependentKeys) void qc.invalidateQueries({ queryKey: k })
    },
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/transactions/${id}`),
    onSuccess: () => {
      for (const k of transactionDependentKeys) void qc.invalidateQueries({ queryKey: k })
    },
  })
}

/** Deletes several transactions in one go; resolves with how many went. */
export function useBulkDeleteTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      // The server takes at most 500 per request.
      let deleted = 0
      for (let i = 0; i < ids.length; i += 500) {
        const r = await api.post<{ deleted: number }>('/transactions/bulk-delete', {
          ids: ids.slice(i, i + 500),
        })
        deleted += r.deleted
      }
      return { deleted }
    },
    onSuccess: () => {
      for (const k of transactionDependentKeys) void qc.invalidateQueries({ queryKey: k })
    },
  })
}

export function useDuplicateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, transaction_date }: { id: string; transaction_date?: string }) =>
      api.post<Transaction>(`/transactions/${id}/duplicate`, transaction_date ? { transaction_date } : {}),
    onSuccess: () => {
      for (const k of transactionDependentKeys) void qc.invalidateQueries({ queryKey: k })
    },
  })
}
