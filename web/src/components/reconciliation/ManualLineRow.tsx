import { Link } from '@tanstack/react-router'
import { Copy, ExternalLink, Search } from 'lucide-react'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { Button } from '@/components/ui/button'
import { formatShortDate } from '@/lib/dates'
import { manualSide } from '@/lib/reconciliation'
import { transactionTitle } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import type { ManualLine } from '@/types/api'
import { ManualStatusBadge } from './badges'

export function ManualLineRow({
  line,
  accountId,
  highlighted,
  onSelect,
  onFindInBank,
  onShowDuplicate,
  registerRef,
}: {
  line: ManualLine
  accountId: string
  highlighted: boolean
  /** Highlight the bank line this is matched to (no-op when unmatched). */
  onSelect: () => void
  onFindInBank: (amount: number) => void
  onShowDuplicate: (txId: string) => void
  registerRef?: (el: HTMLLIElement | null) => void
}) {
  const side = manualSide(line, accountId)
  const amount = side ? (side.isDebit ? -side.amount : side.amount) : line.amount
  const linked = !!line.bank_transaction_id
  const isTransfer = line.type === 'transfer'
  return (
    <li
      ref={registerRef}
      data-tx-id={line.id}
      data-status={line.status}
      className={cn(
        'flex flex-col gap-1.5 px-3 py-2.5',
        highlighted && 'bg-primary/5 ring-primary rounded-xl ring-2 ring-inset',
        line.status === 'ignored' && 'opacity-70',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn('flex w-full items-center gap-3 text-left', linked ? 'cursor-pointer' : 'cursor-default')}
        title={linked ? 'Show the matched bank line' : undefined}
      >
        <CategoryIcon
          icon={line.category_icon}
          color={line.category_color}
          size="sm"
          kind={isTransfer ? 'transfer' : line.type === 'adjustment' ? 'adjustment' : undefined}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{transactionTitle(line)}</p>
          <p className="text-muted-foreground truncate text-xs">
            {formatShortDate(line.transaction_date)}
            {line.category_name && !isTransfer && <> · {line.category_name}</>}
            {line.payee && line.description && <> · {line.description}</>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Money minor={amount} currency={line.currency} tone="auto" sign="always" className="text-sm font-semibold" />
          <ManualStatusBadge status={line.status} />
        </div>
      </button>
      {line.status === 'possible_duplicate' && line.duplicate_of && (
        <button
          type="button"
          onClick={() => onShowDuplicate(line.duplicate_of!)}
          className="text-expense flex w-fit items-center gap-1 text-xs hover:underline"
        >
          <Copy className="size-3" /> duplicate of another entry — show it
        </button>
      )}
      {(line.status === 'unmatched' || line.status === 'possible_duplicate') && (
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="xs" variant="outline" onClick={() => onFindInBank(side?.amount ?? line.amount)}>
            <Search data-icon="inline-start" /> Find in bank
          </Button>
          <Button type="button" size="xs" variant="ghost" asChild>
            <Link to="/transactions/$id" params={{ id: line.id }}>
              <ExternalLink data-icon="inline-start" /> Open
            </Link>
          </Button>
        </div>
      )}
    </li>
  )
}
