import { Link } from '@tanstack/react-router'
import { BudgetBar, TONE } from '@/components/budgets/BudgetRow'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { EmptyState, ErrorState } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { budgetTone, groupBudgets } from '@/lib/budgets'
import { cn } from '@/lib/utils'
import type { ReportBudget } from '@/types/api'

/**
 * The dashboard's budget card: only budgets with spending this month, worst
 * first. Untouched ones are a single line, not a list to scroll past. Tapping
 * a row edits it in place.
 */
export function BudgetList({
  data,
  loading,
  error,
  onRetry,
  currency,
  onEdit,
}: {
  data?: ReportBudget[]
  loading: boolean
  error: unknown
  onRetry: () => void
  currency: string
  onEdit: (b: ReportBudget) => void
}) {
  if (loading && !data) return <Skeleton className="h-40 w-full rounded-xl" />
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
  const { active, unused } = groupBudgets(rows)
  return (
    <div className="flex flex-col gap-3">
      {active.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">Nothing spent against a budget yet this month.</p>
      ) : (
        <ul className="flex flex-col gap-1" aria-label="Budgets in use">
          {active.map((b) => {
            const tone = TONE[budgetTone(b)]
            return (
              <li key={b.budget_id}>
                <button
                  type="button"
                  onClick={() => onEdit(b)}
                  aria-label={`Edit ${b.name} budget`}
                  className="hover:bg-muted/60 -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-3 rounded-xl px-1 py-1.5 text-left transition-colors"
                >
                  <CategoryIcon icon={b.icon} color={b.color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{b.name}</span>
                      <span className={cn('tabular shrink-0 text-xs', b.level === 'over' ? 'text-expense' : 'text-muted-foreground')}>
                        <Money minor={b.spent} currency={currency} /> / <Money minor={b.amount} currency={currency} />
                      </span>
                    </div>
                    <BudgetBar b={b} className="mt-1.5" />
                  </div>
                  <span className={cn('tabular w-10 shrink-0 text-right text-xs font-medium', tone.text)}>{Math.round(b.pct)}%</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {unused.length > 0 && (
        <Link to="/budgets" className="text-muted-foreground hover:text-foreground text-xs">
          {unused.length} budget{unused.length === 1 ? '' : 's'} not used yet
        </Link>
      )}
    </div>
  )
}
