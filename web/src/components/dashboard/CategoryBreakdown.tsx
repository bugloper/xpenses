import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { EmptyState, ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import { refundsBeyondSpending, rollupCategories } from '@/lib/reports'
import type { DateRange } from '@/lib/dates'
import type { ReportCategory } from '@/types/api'

const SHOWN = 6

/**
 * Where the period's money went, ranked: each main category with its share as
 * a thin bar, the rest folded into one line, and the total ruled off below.
 */
export function CategoryBreakdown({
  data,
  loading,
  error,
  onRetry,
  currency,
  range,
}: {
  data?: ReportCategory[]
  loading: boolean
  error: unknown
  onRetry: () => void
  currency: string
  range: DateRange
}) {
  if (loading && !data)
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-md" />
        ))}
      </div>
    )
  if (error && !data) return <ErrorState error={error} onRetry={onRetry} compact />
  const rows = rollupCategories(data ?? []).map((g) => g.row)
  if (rows.length === 0) return <EmptyState title="No expenses in this period" className="py-10" />
  const ranked = rows.reduce((n, r) => n + r.amount, 0)
  // Refunds that outweigh their category's spending still come off the total.
  const refunds = refundsBeyondSpending(data ?? [])
  const total = ranked + refunds
  const top = rows.slice(0, SHOWN)
  const rest = rows.slice(SHOWN)
  const restAmount = rest.reduce((n, r) => n + r.amount, 0)
  const share = (amount: number) => (ranked > 0 ? (amount * 100) / ranked : 0)

  return (
    <div>
      <ol className="divide-rule divide-y">
        {top.map((r, i) => {
          const pct = share(r.amount)
          return (
            <li key={`${r.category_id ?? 'none'}-${i}`}>
              <Link
                to="/transactions"
                search={
                  r.category_id
                    ? { category: r.category_id, from: range.from, to: range.to, tab: 'expense' }
                    : undefined
                }
                disabled={!r.category_id}
                className="hover:bg-muted/55 focus-visible:bg-muted/70 flex items-center gap-3 px-4 py-3 transition-colors focus-visible:outline-none sm:px-5"
              >
                <span className="eyebrow w-4 shrink-0 text-right" aria-hidden>
                  {i + 1}
                </span>
                <CategoryIcon icon={r.icon} color={r.color} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    <Money minor={r.amount} currency={currency} className="shrink-0 text-sm font-medium" />
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div className="bg-bar h-1 flex-1 overflow-hidden rounded-[2px]">
                      <div className="bg-foreground/75 h-full rounded-[2px]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-muted-foreground tabular w-10 shrink-0 text-right font-mono text-[0.6875rem]">
                      {Math.round(pct)}%
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          )
        })}
        {rest.length > 0 && (
          <li>
            <Link
              to="/reports"
              search={{ tab: 'spending', period: 'custom', from: range.from, to: range.to }}
              className="hover:bg-muted/55 text-muted-foreground flex items-center gap-3 px-4 py-3 text-sm transition-colors sm:px-5"
            >
              <span className="w-4 shrink-0" aria-hidden />
              <span className="flex-1">
                {rest.length} more {rest.length === 1 ? 'category' : 'categories'} ·{' '}
                {Math.round(share(restAmount))}%
              </span>
              <Money minor={restAmount} currency={currency} className="text-foreground text-sm" />
              <ChevronRight className="size-4" />
            </Link>
          </li>
        )}
      </ol>
      {refunds < 0 && (
        <div className="text-muted-foreground flex items-baseline justify-between gap-3 border-t px-4 py-2.5 text-sm sm:px-5">
          <span>Refunds on categories with no spending this period</span>
          <Money minor={refunds} currency={currency} className="text-sm" />
        </div>
      )}
      <div className="flex items-baseline justify-between gap-3 border-t px-4 py-3 sm:px-5">
        <span className="eyebrow">Total spent</span>
        <Money minor={total} currency={currency} className="figure text-lg" />
      </div>
    </div>
  )
}
