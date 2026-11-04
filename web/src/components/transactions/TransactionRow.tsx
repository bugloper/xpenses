import { Link } from '@tanstack/react-router'
import { CloudUpload, AlertTriangle } from 'lucide-react'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { Badge } from '@/components/ui/badge'
import { useAccounts, useCategories } from '@/lib/queries'
import { displayAmount, transactionSubtitle, transactionTitle, type ListRow } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/types/api'

export function TransactionRow({
  row,
  perspectiveAccountId,
  onClick,
}: {
  row: ListRow
  perspectiveAccountId?: string
  onClick?: (tx: Transaction) => void
}) {
  // Queued items only carry ids; resolve names/icons from the cached lists.
  const { data: categories } = useCategories(true)
  const { data: accounts } = useAccounts(true)
  const tx: Transaction =
    row.kind === 'pending'
      ? (() => {
          const cat = categories?.find((c) => c.id === row.tx.category_id)
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
  const tone = isTransfer && !perspectiveAccountId ? 'neutral' : tx.type === 'adjustment' ? 'auto' : 'auto'
  const pending = row.kind === 'pending'
  const inner = (
    <>
      <CategoryIcon
        icon={tx.category_icon}
        color={tx.category_color}
        kind={isTransfer ? 'transfer' : tx.type === 'adjustment' ? 'adjustment' : undefined}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{transactionTitle(tx)}</p>
          {pending && (
            <Badge
              variant={row.item.status === 'failed' ? 'destructive' : 'secondary'}
              className="h-5 gap-1 px-1.5 text-[10px]"
            >
              {row.item.status === 'failed' ? (
                <AlertTriangle className="size-3" />
              ) : (
                <CloudUpload className="size-3" />
              )}
              {row.item.status === 'failed' ? 'Sync failed' : 'Pending sync'}
            </Badge>
          )}
          {tx.status === 'pending' && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              Draft
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground truncate text-xs">
          {transactionSubtitle(tx) || tx.category_name || (isTransfer ? 'Transfer' : '')}
        </p>
      </div>
      <div className="flex flex-col items-end">
        <Money
          minor={amount}
          currency={tx.currency}
          tone={tone}
          sign={isTransfer && !perspectiveAccountId ? 'never' : 'always'}
          className={cn('text-[0.9375rem] font-semibold', tx.status === 'void' && 'line-through opacity-60')}
        />
        {tx.category_name && !isTransfer && tx.payee && (
          <span className="text-muted-foreground text-[11px]">{tx.category_name}</span>
        )}
      </div>
    </>
  )
  const cls =
    'flex min-h-15 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 sm:px-5'
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
