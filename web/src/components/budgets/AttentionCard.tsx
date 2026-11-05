import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { overLimitLabel } from '@/lib/budgets'
import type { ReportBudget } from '@/types/api'
import { BudgetBar } from './BudgetRow'

/** The budgets that have gone past their limit this month, all of them, worst first. */
export function AttentionCard({
  over,
  currency,
  onEdit,
}: {
  over: ReportBudget[]
  currency: string
  onEdit: (b: ReportBudget) => void
}) {
  if (over.length === 0) return null
  return (
    <section
      aria-labelledby="attention-heading"
      className="rounded-[1.25rem] border border-expense/25 bg-expense/5 p-4"
    >
      <h2 id="attention-heading" className="text-expense text-sm font-semibold">
        Needs attention · {overLimitLabel(over.length)}
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {over.map((b) => (
          <li key={b.budget_id}>
            <button
              type="button"
              onClick={() => onEdit(b)}
              className="bg-card hover:bg-muted/60 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
              aria-label={`Review ${b.name} budget`}
            >
              <CategoryIcon icon={b.icon} color={b.color} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{b.name}</span>
                  <span className="text-expense tabular shrink-0 text-xs font-semibold">{Math.round(b.pct)}%</span>
                </div>
                <BudgetBar b={b} className="mt-1.5" />
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Spent <Money minor={b.spent} currency={currency} /> of <Money minor={b.amount} currency={currency} /> · over by{' '}
                  <Money minor={-b.remaining} currency={currency} className="text-expense" />
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
