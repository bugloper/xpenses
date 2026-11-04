import { useEffect, useRef } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { Money } from '@/components/common/Money'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { formatDayHeading } from '@/lib/dates'
import type { DayGroup } from '@/lib/transactions'
import { uiStore } from '@/lib/ui-store'
import { TransactionRow } from './TransactionRow'

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

  if (loading && groups.length === 0) return <ListSkeleton rows={8} />
  if (error && groups.length === 0) return <ErrorState error={error} onRetry={onRetry} />
  if (groups.length === 0)
    return (
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
    )
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.date} className="flex flex-col gap-1">
          <div className="text-muted-foreground flex items-center justify-between px-2 text-xs">
            <span className="font-semibold tracking-wide uppercase">{formatDayHeading(g.date)}</span>
            <span className="tabular flex items-center gap-2">
              {g.income > 0 && <Money minor={g.income} currency={currency} tone="income" sign="always" />}
              {g.expense > 0 && <Money minor={-g.expense} currency={currency} tone="expense" />}
            </span>
          </div>
          <div className="bg-card divide-y overflow-hidden rounded-[1.25rem] border">
            {g.rows.map((row) => (
              <TransactionRow
                key={row.tx.id}
                row={row}
                perspectiveAccountId={perspectiveAccountId}
                onClick={row.kind === 'pending' ? () => uiStore.setPending(true) : undefined}
              />
            ))}
          </div>
        </section>
      ))}
      {hasMore && (
        <div ref={sentinel} className="flex justify-center py-2">
          <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  )
}
