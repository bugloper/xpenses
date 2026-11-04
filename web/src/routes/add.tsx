import { createRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/common/PageHeader'
import { useSaveTransaction } from '@/components/transactions/AddTransactionSheet'
import { AttachmentField } from '@/components/transactions/AttachmentField'
import { TransactionForm, defaultValues, toCreateRequest } from '@/components/transactions/TransactionForm'
import { useDefaultCurrency } from '@/lib/queries'
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

  const initial = useMemo(
    () => defaultValues({ type: search.type, account_id: search.account, category_id: search.category }),
    [search.type, search.account, search.category],
  )
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <PageHeader title="Add transaction" description="Quick entry. Works offline." />
      <div className="bg-card rounded-[1.25rem] border p-4 sm:p-6">
        <div className="mb-4">
          <AttachmentField file={attachment} onChange={setAttachment} />
        </div>
        <TransactionForm
          initial={initial}
          mode="create"
          currency={currency}
          submitting={submitting}
          serverErrors={serverErrors}
          onCancel={() => void navigate({ to: '/' })}
          onSubmit={async (values, { addAnother }) => {
            const result = await create(toCreateRequest(values, currency), attachment)
            if (result === 'error') return
            setAttachment(null)
            if (!addAnother) void navigate({ to: '/transactions' })
          }}
        />
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
