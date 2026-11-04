import { Link } from '@tanstack/react-router'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { EmptyState, ErrorState } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { ReportBudget } from '@/types/api'

const LEVEL = {
  ok: 'bg-income',
  warn75: 'bg-warning',
  warn90: 'bg-orange-500',
  over: 'bg-expense',
} as const

export function BudgetList({
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
  if (loading && !data) return <Skeleton className="h-40 w-full rounded-xl" />
  if (error && !data) return <ErrorState error={error} onRetry={onRetry} compact />
  const rows = data ?? []
  if (rows.length === 0)
    return (
      <EmptyState
        title="No budgets yet"
        description="Set a monthly budget on any expense category."
        className="py-8"
        action={
          <Button size="sm" variant="outline" asChild>
            <Link to="/categories">Set budgets</Link>
          </Button>
        }
      />
    )
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((b) => {
        const pct = Math.max(0, Math.min(100, b.pct))
        return (
          <li key={b.budget_id} className="flex items-center gap-3">
            <CategoryIcon icon={b.icon} color={b.color} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium">{b.name}</span>
                <span
                  className={cn(
                    'tabular text-xs',
                    b.level === 'over' ? 'text-expense' : 'text-muted-foreground',
                  )}
                >
                  <Money minor={b.spent} currency={currency} /> /{' '}
                  <Money minor={b.amount} currency={currency} />
                </span>
              </div>
              <div className="bg-muted mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className={cn('h-full rounded-full transition-all', LEVEL[b.level])}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <span
              className={cn(
                'tabular w-10 text-right text-xs font-medium',
                b.level === 'over' ? 'text-expense' : 'text-muted-foreground',
              )}
            >
              {Math.round(b.pct)}%
            </span>
          </li>
        )
      })}
    </ul>
  )
}
