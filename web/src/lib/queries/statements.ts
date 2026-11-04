import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  BankTransactionWithStatus,
  ImportPreview,
  ImportRequest,
  ImportResult,
  Statement,
} from '@/types/api'
import { keys, reconciliationDependentKeys } from './keys'

export function useStatements() {
  return useQuery({
    queryKey: keys.statements.list,
    queryFn: ({ signal }) => api.get<Statement[]>('/statements', signal),
  })
}

export function useStatement(id: string) {
  return useQuery({
    queryKey: keys.statements.detail(id),
    queryFn: ({ signal }) => api.get<Statement>(`/statements/${id}`, signal),
    enabled: !!id,
  })
}

export function useStatementTransactions(id: string) {
  return useQuery({
    queryKey: keys.statements.transactions(id),
    queryFn: ({ signal }) =>
      api.get<BankTransactionWithStatus[]>(`/statements/${id}/transactions`, signal),
    enabled: !!id,
  })
}

export type ParseStatementInput = { file: File; account_id: string; password: string }

/**
 * Uploads the PDF for parsing. The password travels only inside this multipart
 * body; it is never stored client-side.
 */
export function useParseStatement() {
  return useMutation({
    mutationFn: ({ file, account_id, password }: ParseStatementInput) => {
      const form = new FormData()
      form.append('file', file, file.name)
      form.append('account_id', account_id)
      if (password) form.append('password', password)
      return api.postForm<ImportPreview>('/statements/parse', form)
    },
  })
}

export function useImportStatement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ImportRequest) => api.post<ImportResult>('/statements/import', body),
    onSuccess: () => {
      for (const k of reconciliationDependentKeys) void qc.invalidateQueries({ queryKey: k })
    },
  })
}

export function useDeleteStatement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/statements/${id}`),
    onSuccess: () => {
      for (const k of reconciliationDependentKeys) void qc.invalidateQueries({ queryKey: k })
    },
  })
}

/** URL of the original PDF (audit copy) for an `<a href>`. */
export function statementFileUrl(id: string): string {
  return `/api/v1/statements/${id}/file`
}
