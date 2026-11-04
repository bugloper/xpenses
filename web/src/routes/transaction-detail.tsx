import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Copy, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Money } from '@/components/common/Money'
import { ErrorState, ListSkeleton } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/api'
import { formatDateTime, formatShortDate } from '@/lib/dates'
import { useCategories, useDeleteTransaction, useDuplicateTransaction, useTransaction } from '@/lib/queries'
import { displayAmount, transactionTitle } from '@/lib/transactions'
import { uiStore } from '@/lib/ui-store'
import { categoryLabel } from '@/lib/categories'
import { appRoute } from './__root'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  )
}

function TransactionDetailPage() {
  const { id } = transactionDetailRoute.useParams()
  const navigate = useNavigate()
  const { data: tx, isPending, error, refetch } = useTransaction(id)
  const { data: allCategories = [] } = useCategories(true)
  const del = useDeleteTransaction()
  const dup = useDuplicateTransaction()
  const [confirm, setConfirm] = useState(false)

  if (isPending) return <ListSkeleton rows={6} />
  if (error || !tx)
    return <ErrorState error={error ?? new Error('Not found')} onRetry={() => void refetch()} />

  const isTransfer = tx.type === 'transfer'
  const amount = displayAmount(tx)

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
        <Link to="/transactions">
          <ArrowLeft data-icon="inline-start" /> Transactions
        </Link>
      </Button>
      <div className="bg-card ring-foreground/10 flex flex-col items-center gap-3 rounded-2xl p-6 text-center ring-1">
        <CategoryIcon
          icon={tx.category_icon}
          color={tx.category_color}
          size="lg"
          kind={isTransfer ? 'transfer' : tx.type === 'adjustment' ? 'adjustment' : undefined}
        />
        <Money
          minor={amount}
          currency={tx.currency}
          tone={isTransfer ? 'neutral' : 'auto'}
          sign={isTransfer ? 'never' : 'always'}
          className="text-4xl font-semibold tracking-tight"
        />
        <p className="text-lg font-medium">{transactionTitle(tx)}</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          <Badge variant="secondary" className="capitalize">
            {tx.type}
          </Badge>
          {tx.status !== 'cleared' && (
            <Badge variant="outline" className="capitalize">
              {tx.status}
            </Badge>
          )}
          {tx.origin !== 'manual' && (
            <Badge variant="outline" className="capitalize">
              {tx.origin}
            </Badge>
          )}
        </div>
      </div>
      <div className="bg-card ring-foreground/10 divide-y rounded-2xl px-4 ring-1">
        <Row label="Date" value={formatShortDate(tx.transaction_date)} />
        <Row
          label={isTransfer ? 'From' : 'Account'}
          value={
            <Link
              to="/accounts/$id"
              params={{ id: tx.account_id }}
              className="underline-offset-4 hover:underline"
            >
              {tx.account_name ?? tx.account_id}
            </Link>
          }
        />
        {isTransfer && tx.transfer_account_id && (
          <Row
            label="To"
            value={
              <Link
                to="/accounts/$id"
                params={{ id: tx.transfer_account_id }}
                className="underline-offset-4 hover:underline"
              >
                {tx.transfer_account_name ?? tx.transfer_account_id}
              </Link>
            }
          />
        )}
        <Row label="Category" value={categoryLabel(allCategories, tx.category_id) || tx.category_name} />
        <Row label="Description" value={tx.description} />
        <Row label="Created" value={formatDateTime(tx.created_at)} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          className="h-11 rounded-xl"
          onClick={() => uiStore.openAdd({ editId: tx.id })}
        >
          <Pencil data-icon="inline-start" /> Edit
        </Button>
        <Button
          variant="outline"
          className="h-11 rounded-xl"
          disabled={dup.isPending}
          onClick={() =>
            dup.mutate(
              { id: tx.id },
              {
                onSuccess: (created) => {
                  toast.success('Duplicated for today')
                  void navigate({ to: '/transactions/$id', params: { id: created.id } })
                },
                onError: (e) => toast.error(errorMessage(e)),
              },
            )
          }
        >
          <Copy data-icon="inline-start" /> Duplicate
        </Button>
        <Button variant="destructive" className="h-11 rounded-xl" onClick={() => setConfirm(true)}>
          <Trash2 data-icon="inline-start" /> Delete
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this transaction?"
        description="This cannot be undone. Account balances will update immediately."
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={async () => {
          try {
            await del.mutateAsync(tx.id)
            toast.success('Transaction deleted')
            void navigate({ to: '/transactions' })
          } catch (e) {
            toast.error(errorMessage(e))
          }
        }}
      />
    </div>
  )
}

export const transactionDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/transactions/$id',
  component: TransactionDetailPage,
})
