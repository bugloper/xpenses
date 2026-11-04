import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, request } from '@/lib/api'
import { transactionDependentKeys } from '@/lib/queries/keys'
import type { Transaction } from '@/types/api'

/** Where the browser fetches a transaction's image (same-origin, cookie auth). */
export function attachmentUrl(txId: string): string {
  return `/api/v1/transactions/${txId}/attachment`
}

export const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

/** Client-side check mirroring the server's rules, for an early message. */
export function attachmentProblem(file: File): string | null {
  if (!ATTACHMENT_TYPES.includes(file.type)) return 'Only JPEG, PNG or WebP images can be attached'
  if (file.size > ATTACHMENT_MAX_BYTES) return 'The image is too large (10 MB max)'
  if (file.size === 0) return 'The file is empty'
  return null
}

export async function uploadAttachment(txId: string, file: File): Promise<Transaction> {
  const form = new FormData()
  form.append('file', file, file.name || 'screenshot')
  return request<{ data: Transaction }>(`/transactions/${txId}/attachment`, { method: 'PUT', form }).then(
    (r) => r.data,
  )
}

export function useUploadAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadAttachment(id, file),
    onSuccess: () => {
      for (const k of transactionDependentKeys) void qc.invalidateQueries({ queryKey: k })
    },
  })
}

export function useRemoveAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/transactions/${id}/attachment`),
    onSuccess: () => {
      for (const k of transactionDependentKeys) void qc.invalidateQueries({ queryKey: k })
    },
  })
}
