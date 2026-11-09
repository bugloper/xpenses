import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Copy, Pencil, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { ErrorState, ListSkeleton } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AttachmentPanel } from '@/components/transactions/AttachmentPanel'
import { errorMessage } from '@/lib/api'
import { categoryPath } from '@/lib/categories'
import { formatDateTime, formatShortDate, parseISODate } from '@/lib/dates'
import { currencySymbol, formatMoney } from '@/lib/money'
import { useCategories, useDeleteTransaction, useDuplicateTransaction, useTransaction } from '@/lib/queries'
import { referenceLabel } from '@/lib/receipts'
import { displayAmount, transactionTitle } from '@/lib/transactions'
import { uiStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import { appRoute } from './__root'

/** One line of the record: a mono label and its value, ruled off below. */
function Line({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  if (children === null || children === undefined || children === '' || children === false) return null
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <dt className="eyebrow">{label}</dt>
      <dd className={cn('min-w-0 text-sm break-words', mono && 'font-mono text-[0.8125rem] tracking-wide')}>
        {children}
      </dd>
    </div>
  )
}

function longDate(iso: string) {
  const d = parseISODate(iso)
  return d ? format(d, 'EEEE, d MMMM yyyy') : iso
}

const TYPE_LABEL: Record<string, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  refund: 'Refund',
  adjustment: 'Adjustment',
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
  const tone = isTransfer || amount === 0 ? '' : amount > 0 ? 'text-income' : 'text-expense'
  const sign = isTransfer ? '' : amount < 0 ? '−' : amount > 0 ? '+' : ''
  const [whole, fraction] = formatMoney(Math.abs(amount), tx.currency, { bare: true }).split('.')
  const path = categoryPath(allCategories, tx.category_id)
  const isVoid = tx.status === 'void'

  const duplicate = () =>
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

  const accountLink = (accountId: string, name?: string) => (
    <Link
      to="/accounts/$id"
      params={{ id: accountId }}
      className="decoration-foreground/30 hover:decoration-foreground font-medium underline underline-offset-4"
    >
      {name ?? accountId}
    </Link>
  )

  return (
    <div className="flex flex-col gap-5">
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground -ml-2.5 hidden w-fit lg:inline-flex"
        asChild
      >
        <Link to="/transactions">
          <ArrowLeft data-icon="inline-start" /> Transactions
        </Link>
      </Button>

      <div className="grid items-start gap-5 lg:grid-cols-12 lg:gap-8">
        {/* The record itself, set like a receipt. */}
        <article className="bg-card rounded-lg border lg:col-span-7">
          <header className="px-4 pt-5 pb-6 sm:px-6 sm:pt-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="eyebrow">
                {TYPE_LABEL[tx.type] ?? tx.type} · {formatShortDate(tx.transaction_date)}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {tx.status === 'pending' && <Badge variant="outline">Draft</Badge>}
                {isVoid && (
                  <Badge variant="outline" className="text-muted-foreground">
                    Void
                  </Badge>
                )}
                {tx.origin !== 'manual' && <Badge variant="secondary">{tx.origin}</Badge>}
              </span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <CategoryIcon
                icon={tx.category_icon}
                color={tx.category_color}
                kind={isTransfer ? 'transfer' : tx.type === 'adjustment' ? 'adjustment' : undefined}
              />
              <h1 className="font-display min-w-0 text-[1.625rem] leading-tight font-medium break-words sm:text-[1.875rem]">
                {transactionTitle(tx)}
              </h1>
            </div>
            <p
              className={cn(
                'figure mt-5 flex items-baseline leading-none',
                tone,
                isVoid && 'line-through opacity-60',
              )}
              aria-label={`Amount ${formatMoney(amount, tx.currency, { sign: isTransfer ? 'never' : 'always' })}`}
            >
              <span className="mr-1 text-[2.25rem] sm:text-[2.75rem]">{sign}</span>
              <span className="text-muted-foreground mr-2 text-[1.5rem] sm:text-[1.75rem]">
                {currencySymbol(tx.currency)}
              </span>
              <span className="text-[3rem] sm:text-[3.75rem]">{whole}</span>
              {fraction && <span className="text-[1.75rem] sm:text-[2.25rem]">.{fraction}</span>}
            </p>
          </header>

          <dl className="divide-rule mx-4 divide-y border-t border-dashed sm:mx-6">
            <Line label="Date">{longDate(tx.transaction_date)}</Line>
            <Line label={isTransfer ? 'From' : 'Account'}>{accountLink(tx.account_id, tx.account_name)}</Line>
            {isTransfer && tx.transfer_account_id && (
              <Line label="To">{accountLink(tx.transfer_account_id, tx.transfer_account_name)}</Line>
            )}
            <Line label="Category">
              {path ? (
                <span className="flex flex-wrap items-baseline gap-x-1.5">
                  {path.parent && <span className="text-muted-foreground">{path.parent.name} ›</span>}
                  <span className="font-medium">{path.category.name}</span>
                </span>
              ) : (
                tx.category_name
              )}
            </Line>
            <Line label="Payee">{tx.payee}</Line>
            <Line label="Description">{tx.description}</Line>
            {tx.receipt?.reference && (
              <Line label={referenceLabel(tx.receipt.bank)} mono>
                {tx.receipt.reference}
              </Line>
            )}
            <Line label="Notes">{tx.notes && <span className="whitespace-pre-line">{tx.notes}</span>}</Line>
            <Line label="Tags">{tx.tags && tx.tags.length > 0 && tx.tags.join(', ')}</Line>
            <Line label="Recorded">
              <span className="text-muted-foreground">{formatDateTime(tx.created_at)}</span>
            </Line>
          </dl>

          <footer className="bg-muted/40 mt-2 flex flex-wrap items-center gap-2 rounded-b-lg border-t px-4 py-3 sm:px-6">
            <Button onClick={() => uiStore.openAdd({ editId: tx.id })}>
              <Pencil data-icon="inline-start" /> Edit
            </Button>
            <Button variant="outline" disabled={dup.isPending} onClick={duplicate}>
              <Copy data-icon="inline-start" /> Duplicate
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive ml-auto"
              onClick={() => setConfirm(true)}
            >
              <Trash2 data-icon="inline-start" /> Delete
            </Button>
          </footer>
        </article>

        <div className="lg:sticky lg:top-24 lg:col-span-5">
          <AttachmentPanel tx={tx} />
        </div>
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
