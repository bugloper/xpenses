import { Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { AlertTriangle, CloudUpload, Paperclip } from 'lucide-react'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { Badge } from '@/components/ui/badge'
import { categoryPath } from '@/lib/categories'
import { parseISODate } from '@/lib/dates'
import { useAccounts, useCategories } from '@/lib/queries'
import { displayAmount, transactionTitle, type ListRow } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/types/api'

/**
 * The ledger's columns on wide screens: date · payee · category · account ·
 * amount. Shared by the column header and every row so they line up.
 */
export const LEDGER_COLUMNS =
  'lg:grid lg:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,12rem)_minmax(0,10rem)_8.5rem] lg:gap-x-5'

function shortDate(iso: string) {
  const d = parseISODate(iso)
  return d ? format(d, 'dd MMM') : iso
}

export function TransactionRow({
  row,
  perspectiveAccountId,
  onClick,
  columns,
}: {
  row: ListRow
  perspectiveAccountId?: string
  onClick?: (tx: Transaction) => void
  /** Lay the row out in ledger columns on wide screens (lg and up). */
  columns?: boolean
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
  const neutral = isTransfer && !perspectiveAccountId
  const pending = row.kind === 'pending'
  const isVoid = tx.status === 'void'
  const path = categoryPath(categories, tx.category_id)

  const categoryText = isTransfer
    ? 'Transfer'
    : tx.type === 'adjustment'
      ? 'Adjustment'
      : (path?.category.name ?? tx.category_name ?? 'Uncategorised')
  const accountText = tx.account_name ?? ''
  const title = transactionTitle(tx)
  // What the payee line is about, when there's more than its name.
  const detail = isTransfer ? tx.description : tx.payee && tx.description ? tx.description : ''
  const reference = tx.receipt?.reference

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
      {columns && (
        <span className="text-muted-foreground hidden font-mono text-xs tracking-wide uppercase lg:block">
          {shortDate(tx.transaction_date)}
        </span>
      )}
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <CategoryIcon
          icon={tx.category_icon}
          color={tx.category_color}
          size="sm"
          kind={isTransfer ? 'transfer' : tx.type === 'adjustment' ? 'adjustment' : undefined}
          className={cn(isVoid && 'opacity-50')}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cn('truncate text-sm font-medium', isVoid && 'text-muted-foreground')}>
              {title}
            </span>
            {flags}
          </span>
          {/* Narrow screens (and the compact list): category and account under the name. */}
          <span className={cn('text-muted-foreground mt-0.5 block truncate text-xs', columns && 'lg:hidden')}>
            {[detail, isTransfer ? '' : categoryText, isTransfer ? '' : accountText]
              .filter(Boolean)
              .join(' · ') || (isTransfer ? 'Transfer' : '')}
          </span>
          {/* Ledger columns: the line under the name is the description and the reference. */}
          {columns && (detail || reference) && (
            <span className="text-muted-foreground mt-0.5 hidden truncate text-xs lg:flex lg:items-center lg:gap-2">
              {detail && <span className="truncate">{detail}</span>}
              {reference && (
                <span className="shrink-0 font-mono text-[0.6875rem] tracking-wide" title="Reference">
                  {reference}
                </span>
              )}
            </span>
          )}
        </span>
      </span>
      {columns && (
        <>
          <span className="hidden min-w-0 lg:block">
            <span className="block truncate text-sm">{categoryText}</span>
            {path?.parent && (
              <span className="text-muted-foreground block truncate text-xs">{path.parent.name}</span>
            )}
          </span>
          <span className="hidden min-w-0 lg:block">
            <span className="text-muted-foreground block truncate text-sm">
              {tx.account_name ?? (isTransfer ? 'Account' : '')}
            </span>
            {isTransfer && (
              <span className="text-muted-foreground block truncate text-xs">
                to {tx.transfer_account_name ?? 'Account'}
              </span>
            )}
          </span>
        </>
      )}
      <span className="shrink-0 text-right">
        <Money
          minor={amount}
          currency={tx.currency}
          tone={neutral ? 'neutral' : 'auto'}
          sign={neutral ? 'never' : 'always'}
          className={cn('text-[0.9375rem] font-medium', isVoid && 'text-muted-foreground line-through')}
        />
      </span>
    </>
  )
  const cls = cn(
    'flex min-h-15 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors sm:px-5',
    'hover:bg-muted/50 focus-visible:bg-muted/70 focus-visible:outline-none',
    columns && cn(LEDGER_COLUMNS, 'lg:min-h-14 lg:items-center'),
    pending && 'bg-saffron-soft/25',
  )
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
