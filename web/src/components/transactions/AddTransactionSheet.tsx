import { AttachmentField } from './AttachmentField'
import { ReceiptCard } from './ReceiptCard'
import { toReceipt, useReceiptScan } from '@/lib/receipts'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { ListSkeleton } from '@/components/common/States'
import { errorMessage, isApiError } from '@/lib/api'
import { minorToDecimalString } from '@/lib/money'
import {
  getPending,
  reviseAndRequeue,
  submitTransaction,
  syncManager,
  type PendingTransaction,
} from '@/lib/offline'
import {
  transactionDependentKeys,
  useDefaultCurrency,
  useTransaction,
  useUpdateSettings,
  useUpdateTransaction,
} from '@/lib/queries'
import { uiStore, useUIStore, type AddPreset } from '@/lib/ui-store'
import type { CreateTransactionRequest, UpdateTransactionRequest } from '@/types/api'
import {
  TransactionForm,
  defaultValues,
  fromTransaction,
  toCreateRequest,
  type TransactionFormValues,
} from './TransactionForm'

/** Hook shared by the sheet and the /add page: creates (with offline fallback) and remembers last-used ids. */
export function useSaveTransaction() {
  const qc = useQueryClient()
  const updateSettings = useUpdateSettings()
  const [submitting, setSubmitting] = useState(false)
  const [serverErrors, setServerErrors] = useState<Record<string, string> | undefined>()

  async function create(
    payload: CreateTransactionRequest,
    attachment: File | null = null,
  ): Promise<'saved' | 'queued' | 'error'> {
    setSubmitting(true)
    setServerErrors(undefined)
    try {
      const res = await submitTransaction(payload, attachment)
      for (const k of transactionDependentKeys) void qc.invalidateQueries({ queryKey: k })
      // Remember last used on the server too (best effort, never blocks).
      const patch: Record<string, string> = { 'ui.last_account_id': payload.account_id }
      if (payload.category_id) patch['ui.last_category_id'] = payload.category_id
      updateSettings.mutate(patch, { onError: () => undefined })
      if (res.queued) {
        toast.info('Saved offline', { description: 'It will sync when you are back online.' })
        return 'queued'
      }
      toast.success('Transaction saved')
      return 'saved'
    } catch (e) {
      if (isApiError(e) && e.isValidation && Object.keys(e.details).length) setServerErrors(e.details)
      toast.error(errorMessage(e, 'Could not save'))
      return 'error'
    } finally {
      setSubmitting(false)
    }
  }

  return { create, submitting, serverErrors, setServerErrors, setSubmitting }
}

/** Convert form values into a PATCH body for an existing transaction. */
export function toUpdateRequest(v: TransactionFormValues, currency: string): UpdateTransactionRequest {
  const c = toCreateRequest(v, currency)
  return {
    type: c.type,
    amount: c.amount,
    currency: c.currency,
    account_id: c.account_id,
    transfer_account_id: c.transfer_account_id ?? undefined,
    clear_transfer_account: !c.transfer_account_id,
    category_id: c.category_id ?? undefined,
    clear_category: !c.category_id,
    description: c.description,
    transaction_date: c.transaction_date,
  }
}

export function AddTransactionSheet() {
  const { addOpen, addPreset } = useUIStore()
  // The sheet is opened from app state (the + button, keyboard shortcuts),
  // not a Radix trigger, so focus has to be restored to the opener by hand.
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (addOpen) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      return
    }
    const el = opener.current
    opener.current = null
    if (el && el.isConnected) {
      const id = requestAnimationFrame(() => el.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [addOpen])
  const editId = addPreset?.editId ?? ''
  const pendingClientId = addPreset?.pendingClientId ?? ''
  const title = editId ? 'Edit transaction' : pendingClientId ? 'Fix queued transaction' : 'Add transaction'
  return (
    <ResponsiveSheet
      open={addOpen}
      onOpenChange={(o) => (o ? uiStore.openAdd(addPreset) : uiStore.closeAdd())}
      title={title}
      desktopWidth="sm:max-w-lg"
    >
      {/* Keyed so every open starts with fresh local state. */}
      {addOpen && <SheetBody key={`${editId}|${pendingClientId}`} preset={addPreset} />}
    </ResponsiveSheet>
  )
}

function SheetBody({ preset }: { preset: AddPreset | null }) {
  const currency = useDefaultCurrency()
  const { create, submitting, serverErrors, setServerErrors, setSubmitting } = useSaveTransaction()
  const update = useUpdateTransaction()
  const editId = preset?.editId ?? ''
  const pendingClientId = preset?.pendingClientId ?? ''
  const { data: editing, isLoading: loadingEdit } = useTransaction(editId)
  const [pendingItem, setPendingItem] = useState<PendingTransaction | null>(null)
  const [attachment, setAttachment] = useState<File | null>(null)
  const scan = useReceiptScan(attachment)
  const receipt = toReceipt(scan.result)
  const prefillAmount =
    scan.result?.recognised && scan.result.amount > 0 ? minorToDecimalString(scan.result.amount) : ''
  const prefillDate = scan.result?.recognised && scan.result.date ? scan.result.date : ''

  useEffect(() => {
    if (!pendingClientId) return
    let cancelled = false
    void getPending(pendingClientId).then((p) => {
      if (cancelled) return
      setPendingItem(p ?? null)
      if (p?.last_error) setServerErrors({ amount: p.last_error })
    })
    return () => {
      cancelled = true
    }
  }, [pendingClientId, setServerErrors])

  const mode: 'create' | 'edit' = editId ? 'edit' : 'create'
  const initial = useMemo<TransactionFormValues | null>(() => {
    if (editId) return editing ? fromTransaction(editing) : null
    if (pendingClientId) {
      if (!pendingItem) return null
      const p = pendingItem.payload
      return {
        type: p.type,
        amount: minorToDecimalString(p.amount),
        account_id: p.account_id,
        transfer_account_id: p.transfer_account_id ?? undefined,
        category_id: p.category_id ?? undefined,
        transaction_date: p.transaction_date,
        description: p.description ?? '',
      }
    }
    return defaultValues({
      type: preset?.type,
      account_id: preset?.account_id,
      transfer_account_id: preset?.transfer_account_id,
      category_id: preset?.category_id,
      ...(prefillAmount ? { amount: prefillAmount } : {}),
      ...(prefillDate ? { transaction_date: prefillDate } : {}),
    })
  }, [editId, editing, pendingClientId, pendingItem, preset, prefillAmount, prefillDate])

  async function handleSubmit(values: TransactionFormValues, opts: { addAnother: boolean }) {
    if (mode === 'edit' && editing) {
      setSubmitting(true)
      try {
        await update.mutateAsync({ id: editing.id, ...toUpdateRequest(values, editing.currency || currency) })
        toast.success('Transaction updated')
        uiStore.closeAdd()
      } catch (e) {
        if (isApiError(e) && e.isValidation && Object.keys(e.details).length) setServerErrors(e.details)
        toast.error(errorMessage(e, 'Could not update'))
      } finally {
        setSubmitting(false)
      }
      return
    }
    if (pendingItem) {
      await reviseAndRequeue(pendingItem.client_id, toCreateRequest(values, currency))
      void syncManager.syncNow({ force: true })
      toast.success('Queued again')
      uiStore.closeAdd()
      return
    }
    const result = await create({ ...toCreateRequest(values, currency), receipt }, attachment)
    if (result === 'error') return
    setAttachment(null)
    if (!opts.addAnother) uiStore.closeAdd()
  }

  const loading = (mode === 'edit' && loadingEdit) || (!!pendingClientId && !pendingItem)
  if (loading || !initial) return <ListSkeleton rows={4} />
  return (
    <>
      {mode === 'create' && !pendingItem && (
        <div className="mb-4 flex flex-col gap-3">
          <AttachmentField file={attachment} onChange={setAttachment} compact />
          <ReceiptCard scan={scan} receipt={receipt} />
        </div>
      )}
      <TransactionForm
        formId="sheet-transaction-form"
        initial={initial}
        mode={mode}
        currency={editing?.currency || currency}
        submitting={submitting}
        serverErrors={serverErrors}
        onSubmit={handleSubmit}
        onCancel={uiStore.closeAdd}
        allowAddAnother={mode === 'create' && !pendingItem}
      />
    </>
  )
}
