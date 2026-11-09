import { createRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/common/PageHeader'
import { useSaveTransaction } from '@/components/transactions/AddTransactionSheet'
import { AttachmentField } from '@/components/transactions/AttachmentField'
import { ReceiptCard } from '@/components/transactions/ReceiptCard'
import { TransactionForm, defaultValues, toCreateRequest } from '@/components/transactions/TransactionForm'
import { minorToDecimalString } from '@/lib/money'
import { useDefaultCurrency } from '@/lib/queries'
import { toReceipt, useReceiptScan } from '@/lib/receipts'
import { SHARE_PARAM, takeSharedFile } from '@/lib/share'
import { appRoute } from './__root'

const searchSchema = z.object({
  type: z.enum(['expense', 'income', 'transfer', 'refund', 'adjustment']).optional().catch(undefined),
  account: z.string().optional().catch(undefined),
  category: z.string().optional().catch(undefined),
  /** Id of an image parked by the service worker's share target. */
  [SHARE_PARAM]: z.string().optional().catch(undefined),
})

function AddPage() {
  const search = addRoute.useSearch()
  const navigate = useNavigate()
  const currency = useDefaultCurrency()
  const { create, submitting, serverErrors } = useSaveTransaction()
  const [attachment, setAttachment] = useState<File | null>(null)
  const scan = useReceiptScan(attachment)
  const receipt = toReceipt(scan.result)
  const sharedId = search[SHARE_PARAM]

  // Opened from the share sheet: collect the screenshot the worker parked.
  useEffect(() => {
    if (!sharedId) return
    let cancelled = false
    if (sharedId === 'missing') {
      toast.error('The shared image did not arrive. Attach it with the button below.')
      void navigate({ to: '/add', search: {}, replace: true })
      return
    }
    void takeSharedFile(sharedId).then((file) => {
      if (cancelled) return
      if (file) {
        setAttachment(file)
        toast.success('Screenshot attached', { description: 'Enter the amount and save.' })
      } else {
        toast.error('The shared image was not found. Attach it with the button below.')
      }
      void navigate({ to: '/add', search: {}, replace: true })
    })
    return () => {
      cancelled = true
    }
  }, [sharedId, navigate])

  // A recognised screenshot prefills the amount and the date; the rest is the user's.
  const prefillAmount =
    scan.result?.recognised && scan.result.amount > 0 ? minorToDecimalString(scan.result.amount) : ''
  const prefillDate = scan.result?.recognised && scan.result.date ? scan.result.date : ''
  const initial = useMemo(
    () =>
      defaultValues({
        type: search.type,
        account_id: search.account,
        category_id: search.category,
        ...(prefillAmount ? { amount: prefillAmount } : {}),
        ...(prefillDate ? { transaction_date: prefillDate } : {}),
      }),
    [search.type, search.account, search.category, prefillAmount, prefillDate],
  )
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Record" title="Add transaction" description="Quick entry. Works offline." />
      <div className="grid items-start gap-5">
        {/* The screenshot first: it fills the form. */}
        <aside className="flex flex-col gap-3">
          <AttachmentField file={attachment} onChange={setAttachment} />
          <ReceiptCard scan={scan} receipt={receipt} />
        </aside>
        <div className="bg-card rounded-lg border px-4 pt-5 pb-4 sm:px-5 max-lg:[&_[data-slot=form-actions]]:bottom-[calc(4rem+env(safe-area-inset-bottom))]">
          <TransactionForm
            initial={initial}
            mode="create"
            currency={currency}
            submitting={submitting}
            serverErrors={serverErrors}
            onCancel={() => void navigate({ to: '/' })}
            onSubmit={async (values, { addAnother }) => {
              const result = await create({ ...toCreateRequest(values, currency), receipt }, attachment)
              if (result === 'error') return
              setAttachment(null)
              if (!addAnother) void navigate({ to: '/transactions' })
            }}
          />
        </div>
      </div>
    </div>
  )
}

export const addRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/add',
  validateSearch: searchSchema,
  component: AddPage,
})
