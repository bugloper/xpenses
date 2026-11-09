import { useEffect, useRef } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { Money } from '@/components/common/Money'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { formatDayHeading } from '@/lib/dates'
import type { DayGroup } from '@/lib/transactions'
import { uiStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import { LEDGER_COLUMNS, TransactionRow } from './TransactionRow'

/**
 * The ledger: one sheet, ruled into days. Each day opens with a band carrying
 * its date and net, which sticks under the top bar while its rows scroll by.
 * With `columns`, wide screens get a column header and rows set in columns.
 */
export function TransactionList({
  groups,
  loading,
  error,
  onRetry,
  hasMore,
  loadingMore,
  onLoadMore,
  perspectiveAccountId,
  currency = 'BTN',
  emptyTitle = 'No transactions',
  emptyDescription = 'Tap + to add your first expense.',
  columns,
  className,
}: {
  groups: DayGroup[]
  loading: boolean
  error: unknown
  onRetry: () => void
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  perspectiveAccountId?: string
  currency?: string
  emptyTitle?: string
  emptyDescription?: string
  /** Set the ledger in columns (date · payee · category · account · amount) on wide screens. */
  columns?: boolean
  className?: string
}) {
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!hasMore || !onLoadMore || !sentinel.current) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !loadingMore) onLoadMore()
    })
    io.observe(sentinel.current)
    return () => io.disconnect()
  }, [hasMore, onLoadMore, loadingMore])

  const sheet = cn('bg-card rounded-lg border', className)

  if (loading && groups.length === 0)
    return (
      <div className={cn(sheet, 'p-4')}>
        <ListSkeleton rows={8} />
      </div>
    )
  if (error && groups.length === 0)
    return (
      <div className={sheet}>
        <ErrorState error={error} onRetry={onRetry} />
      </div>
    )
  if (groups.length === 0)
    return (
      <div className={sheet}>
        <EmptyState
          icon={ArrowLeftRight}
          title={emptyTitle}
          description={emptyDescription}
          action={
            <Button size="sm" onClick={() => uiStore.openAdd()}>
              Add transaction
            </Button>
          }
        />
      </div>
    )
  return (
    <div className={sheet}>
      {columns && (
        <div aria-hidden className={cn('eyebrow hidden border-b px-5 py-2.5', LEDGER_COLUMNS)}>
          <span>Date</span>
          <span>Payee / description</span>
          <span>Category</span>
          <span>Account</span>
          <span className="text-right">Amount</span>
        </div>
      )}
      {groups.map((g, i) => (
        <section key={g.date} aria-label={formatDayHeading(g.date)}>
          <div
            className={cn(
              'bg-muted sticky top-14 z-10 flex items-center justify-between gap-3 border-b px-4 py-1.5 sm:px-5 lg:top-16',
              i > 0 && 'border-t',
              i === 0 && !columns && 'rounded-t-[calc(var(--radius-lg)-1px)]',
              i === 0 && columns && 'rounded-t-[calc(var(--radius-lg)-1px)] lg:rounded-none',
            )}
          >
            <h3 className="eyebrow text-foreground/75">{formatDayHeading(g.date)}</h3>
            {(g.income > 0 || g.expense > 0) && (
              <span className="flex items-baseline gap-2 text-xs">
                <span className="eyebrow hidden sm:inline">Net</span>
                <Money
                  minor={g.net}
                  currency={currency}
                  sign="always"
                  className="text-foreground font-medium"
                />
              </span>
            )}
          </div>
          <div className="divide-rule divide-y">
            {g.rows.map((row) => (
              <TransactionRow
                key={row.tx.id}
                row={row}
                columns={columns}
                perspectiveAccountId={perspectiveAccountId}
                onClick={row.kind === 'pending' ? () => uiStore.setPending(true) : undefined}
              />
            ))}
          </div>
        </section>
      ))}
      {hasMore && (
        <div ref={sentinel} className="flex justify-center border-t py-2">
          <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  )
}
