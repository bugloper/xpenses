import { Link } from '@tanstack/react-router'
import { Money } from '@/components/common/Money'
import { EmptyState, ErrorState } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { groupBudgets, overLimitLabel } from '@/lib/budgets'
import { cn } from '@/lib/utils'
import type { ReportBudget } from '@/types/api'

/**
 * The month's budgets in one line: spent against the total limit, and how
 * many are over. The list itself lives on the Budgets page.
 */
export function BudgetSummary({
  data,
  loading,
  error,
  onRetry,
  currency,
}: {
  data?: ReportBudget[]
  loading: boolean
  error: unknown
  onRetry: () => void
  currency: string
}) {
  if (loading && !data) return <Skeleton className="h-24 w-full rounded-xl" />
  if (error && !data) return <ErrorState error={error} onRetry={onRetry} compact />
  const rows = data ?? []
  if (rows.length === 0)
    return (
      <EmptyState
        title="No budgets yet"
        description="Set a monthly limit on any expense category."
        className="py-6"
        action={
          <Button size="sm" variant="outline" asChild>
            <Link to="/budgets">Set budgets</Link>
          </Button>
        }
      />
    )
  const { over, active, unused } = groupBudgets(rows)
  const limit = rows.reduce((n, b) => n + b.amount, 0)
  const spent = rows.reduce((n, b) => n + b.spent, 0)
  const pct = limit > 0 ? Math.round((spent * 100) / limit) : 0
  const tone = over.length > 0 ? 'bg-expense' : pct >= 90 ? 'bg-orange-500' : pct >= 75 ? 'bg-warning' : 'bg-income'
  const status =
    active.length === 0
      ? 'Nothing spent against a budget yet'
      : over.length > 0
        ? overLimitLabel(over.length)
        : `${active.length} in use · all within their limits`
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs">Spent this month</p>
          <p className="tabular text-xl font-semibold">
            <Money minor={spent} currency={currency} className={cn(spent > limit && 'text-expense')} />
            <span className="text-muted-foreground text-sm font-normal">
              {' '}
              of <Money minor={limit} currency={currency} />
            </span>
          </p>
        </div>
        <span className={cn('tabular text-sm font-semibold', spent > limit ? 'text-expense' : 'text-muted-foreground')}>{pct}%</span>
      </div>
      <div
        className="bg-muted h-2 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="All budgets"
      >
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className={cn('text-xs', over.length > 0 ? 'text-expense font-medium' : 'text-muted-foreground')}>
        {status}
        {unused.length > 0 && active.length > 0 && (
          <span className="text-muted-foreground font-normal"> · {unused.length} not used yet</span>
        )}
      </p>
    </div>
  )
}
