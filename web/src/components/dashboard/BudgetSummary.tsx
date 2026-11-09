import { Link } from '@tanstack/react-router'
import { Meter } from '@/components/common/kit'
import { Money } from '@/components/common/Money'
import { EmptyState, ErrorState } from '@/components/common/States'
import { BUDGET_TONE, BudgetLeft, BudgetMeter } from '@/components/budgets/BudgetRow'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { budgetStatus, budgetTone, groupBudgets, overLimitLabel } from '@/lib/budgets'
import { currentMonth, formatMonthLabel } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { ReportBudget } from '@/types/api'

const SHOWN = 4

/**
 * The month's budgets in a column: spent against the total limit, then the
 * budgets in use worst first, each with a thin meter. The full table lives on
 * the Budgets page.
 */
export function BudgetSummary({
  data,
  loading,
  error,
  onRetry,
  currency,
  month,
}: {
  data?: ReportBudget[]
  loading: boolean
  error: unknown
  onRetry: () => void
  currency: string
  month: string
}) {
  if (loading && !data)
    return (
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="mt-3 h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  if (error && !data) return <ErrorState error={error} onRetry={onRetry} compact />
  const rows = data ?? []
  if (rows.length === 0)
    return (
      <EmptyState
        title="No budgets yet"
        description="Set a monthly limit on any expense category."
        className="py-8"
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
  const label = month === currentMonth() ? 'Spent this month' : `Spent in ${formatMonthLabel(month)}`
  const shown = active.slice(0, SHOWN)
  const hidden = active.length - shown.length

  return (
    <div>
      <div className="p-4 sm:p-5">
        <div className="eyebrow">{label}</div>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <p className="figure text-[1.75rem] leading-none">
            <Money minor={spent} currency={currency} className={cn(spent > limit && 'text-expense')} />
          </p>
          <span
            className={cn(
              'tabular font-mono text-xs',
              spent > limit ? 'text-expense' : 'text-muted-foreground',
            )}
          >
            {pct}%
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-[0.8125rem]">
          of <Money minor={limit} currency={currency} /> across {rows.length}{' '}
          {rows.length === 1 ? 'budget' : 'budgets'}
        </p>
        <Meter value={pct} tone={spent > limit ? 'expense' : 'ink'} label="All budgets" className="mt-3" />
        <p
          className={cn(
            'mt-2 text-xs',
            over.length > 0 ? 'text-expense font-medium' : 'text-muted-foreground',
          )}
        >
          {active.length === 0
            ? 'Nothing spent against a budget yet'
            : over.length > 0
              ? overLimitLabel(over.length)
              : `${active.length} in use · all within their limits`}
        </p>
      </div>

      {shown.length > 0 && (
        <ul className="divide-rule divide-y border-t" aria-label="Budgets in use">
          {shown.map((b) => (
            <li key={b.budget_id} className="px-4 py-3 sm:px-5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium">{b.name}</span>
                <span className={cn('shrink-0 text-xs', BUDGET_TONE[budgetTone(b)].text)}>
                  {budgetStatus(b)}
                </span>
              </div>
              <BudgetMeter b={b} className="mt-2 h-1" />
              <div className="mt-1.5 flex justify-between gap-3 text-xs">
                <span className="text-muted-foreground tabular">
                  <Money minor={b.spent} currency={currency} /> of{' '}
                  <Money minor={b.amount} currency={currency} />
                </span>
                <BudgetLeft b={b} currency={currency} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {(hidden > 0 || unused.length > 0) && (
        <p className="text-muted-foreground border-t px-4 py-3 text-xs sm:px-5">
          {[hidden > 0 && `${hidden} more in use`, unused.length > 0 && `${unused.length} not used yet`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </div>
  )
}
