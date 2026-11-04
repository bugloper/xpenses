import { toast } from 'sonner'
import { errorMessage, isApiError } from '@/lib/api'
import {
  useAutoMatch,
  useCreateFromBankLine,
  useIgnoreBankLine,
  useMarkTransfer,
  useMatchBankLine,
  useMatchWithAdjustment,
  useUnmatchBankLine,
} from '@/lib/queries'
import type { CreateFromBankRequest, MarkTransferRequest } from '@/types/api'

export type LineActions = {
  confirm: (bankId: string, txId: string, note?: string) => Promise<boolean>
  adjust: (bankId: string, txId: string, note?: string) => Promise<boolean>
  unmatch: (bankId: string) => Promise<boolean>
  ignore: (bankId: string, note?: string) => Promise<boolean>
  transfer: (body: MarkTransferRequest) => Promise<boolean>
  create: (body: CreateFromBankRequest) => Promise<boolean>
  autoMatch: (statementId: string) => Promise<number | null>
  busy: boolean
}

/** Human message for a failed reconciliation call: 409 explains the lock, 422 relays the server. */
export function reconciliationErrorMessage(e: unknown): string {
  if (isApiError(e)) {
    if (e.status === 409) return `Already reconciled: ${e.message}`
    if (e.status === 422 || e.status === 400) return errorMessage(e)
    if (e.status === 404) return 'That line no longer exists. Refresh and try again.'
  }
  return errorMessage(e, 'Something went wrong')
}

/** Mutations with toasts and consistent error handling; every write invalidates the workspace. */
export function useReconciliationActions(): LineActions {
  const match = useMatchBankLine()
  const adjustment = useMatchWithAdjustment()
  const unmatch = useUnmatchBankLine()
  const ignore = useIgnoreBankLine()
  const transfer = useMarkTransfer()
  const create = useCreateFromBankLine()
  const auto = useAutoMatch()

  const run = async <T,>(p: Promise<T>, success: (r: T) => string): Promise<boolean> => {
    try {
      const r = await p
      toast.success(success(r))
      return true
    } catch (e) {
      toast.error(reconciliationErrorMessage(e))
      return false
    }
  }

  return {
    busy:
      match.isPending ||
      adjustment.isPending ||
      unmatch.isPending ||
      ignore.isPending ||
      transfer.isPending ||
      create.isPending ||
      auto.isPending,
    confirm: (bank_transaction_id, transaction_id, note) =>
      run(match.mutateAsync({ bank_transaction_id, transaction_id, note }), () => 'Matched'),
    adjust: (bank_transaction_id, transaction_id, note) =>
      run(adjustment.mutateAsync({ bank_transaction_id, transaction_id, note }), () => 'Matched with an adjustment'),
    unmatch: (bank_transaction_id) => run(unmatch.mutateAsync(bank_transaction_id), () => 'Unmatched'),
    ignore: (bank_transaction_id, note) => run(ignore.mutateAsync({ bank_transaction_id, note }), () => 'Ignored'),
    transfer: (body) =>
      run(transfer.mutateAsync(body), (r) => (body.transaction_id ? 'Linked to transfer' : `Transfer created (${r.transaction.transfer_account_name || 'other account'})`)),
    create: (body) => run(create.mutateAsync(body), () => 'Transaction created and matched'),
    autoMatch: async (statementId) => {
      try {
        const r = await auto.mutateAsync(statementId)
        toast.success(r.matched === 0 ? 'No new confident matches' : `Auto-matched ${r.matched} line${r.matched === 1 ? '' : 's'}`, {
          description: r.matched === 0 ? 'Only unique same-amount matches are applied automatically; see suggestions for the rest.' : undefined,
        })
        return r.matched
      } catch (e) {
        toast.error(reconciliationErrorMessage(e))
        return null
      }
    },
  }
}
