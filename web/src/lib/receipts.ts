import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, request } from '@/lib/api'
import { transactionDependentKeys } from '@/lib/queries/keys'
import type { Receipt, ScannedReceipt } from '@/types/api'

/** Whether this server can read screenshots (Tesseract installed). */
export function useReceiptCapabilities() {
  return useQuery({
    queryKey: ['receipts', 'capabilities'],
    queryFn: ({ signal }) => api.get<{ ocr: boolean; banks: string[] }>('/receipts/capabilities', signal),
    staleTime: 60 * 60 * 1000,
  })
}

/** Reads a screenshot on the server; nothing is stored. */
export async function scanReceipt(file: File): Promise<ScannedReceipt> {
  const form = new FormData()
  form.append('file', file, file.name || 'screenshot')
  return request<{ data: ScannedReceipt }>('/receipts/scan', { method: 'POST', form }).then((r) => r.data)
}

/** The part of a scan that is kept on the transaction. */
export function toReceipt(s: ScannedReceipt | null | undefined): Receipt | null {
  if (!s || !s.recognised) return null
  const r = {
    bank: s.bank,
    reference: s.journal_no,
    payment_type: s.payment_type,
    date: s.date,
    time: s.time,
  }
  return r.bank || r.reference || r.payment_type || r.date || r.time ? r : null
}

export type ScanState = {
  status: 'idle' | 'scanning' | 'done' | 'unavailable' | 'error'
  result: ScannedReceipt | null
}

function fileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}|${file.type}`
}

/**
 * Scans `file` whenever it changes (online only). Offline, the server reads
 * the image itself once the queued transaction syncs.
 */
export function useReceiptScan(file: File | null): ScanState {
  const caps = useReceiptCapabilities()
  const enabled = caps.data?.ocr ?? false
  const online = typeof navigator === 'undefined' ? true : navigator.onLine
  const q = useQuery({
    queryKey: ['receipts', 'scan', file ? fileKey(file) : ''],
    queryFn: () => scanReceipt(file as File),
    enabled: !!file && enabled && online,
    retry: false,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  })
  if (!file || !enabled || !online) return { status: 'idle', result: null }
  if (q.isPending) return { status: 'scanning', result: null }
  if (q.isError) {
    const status = (q.error as { status?: number }).status
    return { status: status === 501 ? 'unavailable' : 'error', result: null }
  }
  return { status: 'done', result: q.data ?? null }
}

export function useScanAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<ScannedReceipt>(`/transactions/${id}/attachment/scan`),
    onSuccess: () => {
      for (const k of transactionDependentKeys) void qc.invalidateQueries({ queryKey: k })
    },
  })
}

/** What the app calls its reference: mBoB prints a journal number, mPay an RRNO. */
export function referenceLabel(bank: string): string {
  if (bank === 'mPay') return 'RRNO'
  if (bank === 'mBoB') return 'Journal no.'
  return 'Reference'
}

/** "mBoB · 551-428182 · Personal Transfer" for compact places. */
export function receiptSummary(r: Receipt | null | undefined): string {
  if (!r) return ''
  return [r.bank, r.reference, r.payment_type].filter(Boolean).join(' · ')
}
