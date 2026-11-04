import { createRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { z } from 'zod'
import { PageHeader } from '@/components/common/PageHeader'
import { useSaveTransaction } from '@/components/transactions/AddTransactionSheet'
import { TransactionForm, defaultValues, toCreateRequest } from '@/components/transactions/TransactionForm'
import { useDefaultCurrency } from '@/lib/queries'
import { appRoute } from './__root'

const searchSchema = z.object({
  type: z.enum(['expense', 'income', 'transfer', 'refund', 'adjustment']).optional().catch(undefined),
  account: z.string().optional().catch(undefined),
  category: z.string().optional().catch(undefined),
})

function AddPage() {
  const search = addRoute.useSearch()
  const navigate = useNavigate()
  const currency = useDefaultCurrency()
  const { create, submitting, serverErrors } = useSaveTransaction()
  const initial = useMemo(
    () => defaultValues({ type: search.type, account_id: search.account, category_id: search.category }),
    [search.type, search.account, search.category],
  )
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <PageHeader title="Add transaction" description="Quick entry. Works offline." />
      <div className="bg-card ring-foreground/10 rounded-2xl p-4 ring-1 sm:p-6">
        <TransactionForm
          initial={initial}
          mode="create"
          currency={currency}
          submitting={submitting}
          serverErrors={serverErrors}
          onCancel={() => void navigate({ to: '/' })}
          onSubmit={async (values, { addAnother }) => {
            const result = await create(toCreateRequest(values, currency))
            if (result !== 'error' && !addAnother) void navigate({ to: '/transactions' })
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
