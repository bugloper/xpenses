import { Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { AlertTriangle, Check, CloudUpload, Paperclip } from 'lucide-react'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { Badge } from '@/components/ui/badge'
import { categoryPath } from '@/lib/categories'
import { parseISODate } from '@/lib/dates'
import { useAccounts, useCategories } from '@/lib/queries'
import { displayAmount, isLoanType, specialKind, transactionTitle, type ListRow } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/types/api'

function shortDate(iso: string) {
  const d = parseISODate(iso)
  return d ? format(d, 'dd MMM') : iso
}

export function TransactionRow({
  row,
  perspectiveAccountId,
  onClick,
  selectable,
  selected,
  onToggle,
}: {
  row: ListRow
  perspectiveAccountId?: string
  onClick?: (tx: Transaction) => void
  /** Selection mode: the row toggles a checkbox instead of opening the transaction. */
  selectable?: boolean
  selected?: boolean
  onToggle?: () => void
}) {
  // Queued items only carry ids; resolve names/icons from the cached lists.
  const { data: categories = [] } = useCategories(true)
  const { data: accounts } = useAccounts(true)
  const tx: Transaction =
    row.kind === 'pending'
      ? (() => {
          const cat = categories.find((c) => c.id === row.tx.category_id)
          const acc = accounts?.find((a) => a.id === row.tx.account_id)
          const to = accounts?.find((a) => a.id === row.tx.transfer_account_id)
          return {
            ...row.tx,
            category_name: cat?.name,
            category_icon: cat?.icon,
            category_color: cat?.color,
            account_name: acc?.name,
            transfer_account_name: to?.name,
          }
        })()
      : row.tx
  const amount = displayAmount(tx, perspectiveAccountId)
  const isTransfer = tx.type === 'transfer'
  const isLoan = isLoanType(tx.type)
  // Transfers and loan movements are neither income nor spending: no colour.
  const neutral = (isTransfer && !perspectiveAccountId) || isLoan
  const pending = row.kind === 'pending'
  const isVoid = tx.status === 'void'
  const path = categoryPath(categories, tx.category_id)

  const categoryText = isTransfer
    ? 'Transfer'
    : isLoan
      ? 'Loan'
      : tx.type === 'adjustment'
        ? 'Adjustment'
        : (path?.category.name ?? tx.category_name ?? 'Uncategorised')
  const accountText = tx.account_name ?? ''
  const title = transactionTitle(tx)
  // What the payee line is about, when there's more than its name.
  const detail = isTransfer ? tx.description : tx.payee && tx.description ? tx.description : ''

  const flags = (
    <>
      {tx.has_attachment && (
        <span className="text-muted-foreground shrink-0" title="Has a screenshot">
          <Paperclip className="size-3.5" aria-hidden />
          <span className="sr-only">Has a screenshot</span>
        </span>
      )}
      {pending && (
        <Badge variant={row.item.status === 'failed' ? 'destructive' : 'secondary'} className="shrink-0">
          {row.item.status === 'failed' ? <AlertTriangle /> : <CloudUpload />}
          {row.item.status === 'failed' ? 'Sync failed' : 'Pending sync'}
        </Badge>
      )}
      {tx.status === 'pending' && (
        <Badge variant="outline" className="shrink-0">
          Draft
        </Badge>
      )}
      {isVoid && (
        <Badge variant="outline" className="text-muted-foreground shrink-0">
          Void
        </Badge>
      )}
    </>
  )

  const inner = (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        {selectable && !pending ? (
          <SelectBox checked={!!selected} />
        ) : (
          <CategoryIcon
            icon={tx.category_icon}
            color={tx.category_color}
            size="sm"
            kind={specialKind(tx.type)}
            className={cn(isVoid && 'opacity-50')}
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cn('truncate text-sm font-medium', isVoid && 'text-muted-foreground')}>
              {title}
            </span>
            {flags}
          </span>
          {/* Category and account under the name. */}
          <span className="text-muted-foreground mt-0.5 block truncate text-xs">
            {[detail, isTransfer ? '' : categoryText, isTransfer ? '' : accountText]
              .filter(Boolean)
              .join(' · ') || (isTransfer ? 'Transfer' : '')}
          </span>
        </span>
      </span>
      <span className="shrink-0 text-right">
        <Money
          minor={amount}
          currency={tx.currency}
          tone={neutral ? 'neutral' : 'auto'}
          sign={neutral && !isLoan ? 'never' : 'always'}
          className={cn('text-[0.9375rem] font-medium', isVoid && 'text-muted-foreground line-through')}
        />
      </span>
    </>
  )
  const cls = cn(
    'flex min-h-15 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors sm:px-5',
    'hover:bg-muted/50 focus-visible:bg-muted/70 focus-visible:outline-none',
    pending && 'bg-saffron-soft/25',
    selectable && selected && 'bg-saffron-soft/40 hover:bg-saffron-soft/55',
  )
  if (selectable && !pending) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={!!selected}
        aria-label={`Select ${title}, ${shortDate(tx.transaction_date)}`}
        className={cls}
        onClick={onToggle}
      >
        {inner}
      </button>
    )
  }
  if (pending) {
    return (
      <button type="button" className={cls} onClick={() => onClick?.(tx)}>
        {inner}
      </button>
    )
  }
  return (
    <Link to="/transactions/$id" params={{ id: tx.id }} className={cls} onClick={() => onClick?.(tx)}>
      {inner}
    </Link>
  )
}

/** The checkbox square that stands in for the category icon while selecting. */
export function SelectBox({ checked, mixed }: { checked: boolean; mixed?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors',
        checked || mixed ? 'border-foreground bg-foreground text-background' : 'border-input bg-card',
      )}
    >
      {checked ? (
        <Check className="size-4" strokeWidth={3} />
      ) : mixed ? (
        <span className="bg-background h-0.5 w-3 rounded-full" />
      ) : null}
    </span>
  )
}
