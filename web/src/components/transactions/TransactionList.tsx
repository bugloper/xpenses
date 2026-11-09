import { useEffect, useRef } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { Money } from '@/components/common/Money'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { formatDayHeading } from '@/lib/dates'
import type { DayGroup } from '@/lib/transactions'
import { uiStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import { SelectBox, TransactionRow } from './TransactionRow'

/** Selection mode for the ledger: which saved transactions are ticked. */
export type ListSelection = {
  ids: ReadonlySet<string>
  toggle: (id: string) => void
  setMany: (ids: string[], on: boolean) => void
}

/**
 * The ledger: one sheet, ruled into days. Each day opens with a band carrying
 * its date and net, which sticks under the top bar while its rows scroll by.
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
  className,
  selection,
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
  className?: string
  /** When set, rows tick instead of opening, and each day can be ticked whole. */
  selection?: ListSelection
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
      {groups.map((g, i) => (
        <section key={g.date} aria-label={formatDayHeading(g.date)}>
          <div
            className={cn(
              'bg-muted sticky top-14 z-10 flex items-center justify-between gap-3 border-b px-4 py-1.5 sm:px-5 lg:top-0',
              i > 0 && 'border-t',
              i === 0 && 'rounded-t-[calc(var(--radius-lg)-1px)]',
            )}
          >
            {selection ? (
              <DaySelect group={g} selection={selection} />
            ) : (
              <h3 className="eyebrow text-foreground/75">{formatDayHeading(g.date)}</h3>
            )}
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
                perspectiveAccountId={perspectiveAccountId}
                onClick={row.kind === 'pending' ? () => uiStore.setPending(true) : undefined}
                selectable={!!selection}
                selected={selection?.ids.has(row.tx.id)}
                onToggle={() => selection?.toggle(row.tx.id)}
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

/** A day band's tick: selects or clears every saved transaction of that day. */
function DaySelect({ group, selection }: { group: DayGroup; selection: ListSelection }) {
  const ids = group.rows.filter((r) => r.kind === 'tx').map((r) => r.tx.id)
  const n = ids.filter((id) => selection.ids.has(id)).length
  const all = ids.length > 0 && n === ids.length
  const label = formatDayHeading(group.date)
  return (
    <h3 className="flex items-center">
      <button
        type="button"
        role="checkbox"
        aria-checked={all ? true : n > 0 ? 'mixed' : false}
        aria-label={`Select all on ${label}`}
        disabled={ids.length === 0}
        onClick={() => selection.setMany(ids, !all)}
        className="eyebrow text-foreground/75 hover:text-foreground -my-1 flex items-center gap-2.5 rounded-sm py-1 disabled:opacity-50 [&_svg]:size-3 [&>span]:size-4.5 [&>span]:rounded-[3px]"
      >
        <SelectBox checked={all} mixed={n > 0 && !all} />
        {label}
      </button>
    </h3>
  )
}
