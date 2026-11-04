import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Target } from 'lucide-react'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { currentMonth, formatMonthLabel } from '@/lib/dates'
import { useReportBudgets } from '@/lib/queries'
import { stepMonth } from '@/lib/reports'
import { cn } from '@/lib/utils'
import type { ReportBudget } from '@/types/api'

const LEVEL: Record<ReportBudget['level'], { bar: string; text: string; label: string }> = {
  ok: { bar: 'bg-income', text: 'text-income', label: 'On track' },
  warn75: { bar: 'bg-warning', text: 'text-warning', label: '75% used' },
  warn90: { bar: 'bg-orange-500', text: 'text-orange-500', label: '90% used' },
  over: { bar: 'bg-expense', text: 'text-expense', label: 'Over budget' },
}

export function BudgetsTab({ month, onMonth, currency }: { month: string; onMonth: (m: string) => void; currency: string }) {
  const q = useReportBudgets(month)
  const rows = q.data ?? []
  const totalBudget = rows.reduce((n, r) => n + r.amount, 0)
  const totalSpent = rows.reduce((n, r) => n + r.spent, 0)
  const isCurrent = month === currentMonth()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => onMonth(stepMonth(month, -1))}>
          <ChevronLeft />
        </Button>
        <div className="text-center">
          <p className="font-medium">{formatMonthLabel(month)}</p>
          {!isCurrent && (
            <button type="button" className="text-primary text-xs hover:underline" onClick={() => onMonth(currentMonth())}>
              Back to this month
            </button>
          )}
        </div>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Next month" onClick={() => onMonth(stepMonth(month, 1))}>
          <ChevronRight />
        </Button>
      </div>
      {q.isPending ? (
        <ListSkeleton rows={5} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
      ) : rows.length === 0 ? (
        <div className="bg-card ring-foreground/10 rounded-2xl ring-1">
          <EmptyState
            icon={Target}
            title="No budgets set"
            description="Set a monthly budget on any expense category to track it here."
            className="py-8"
            action={
              <Button size="sm" variant="outline" asChild>
                <Link to="/categories">Set budgets</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="bg-card ring-foreground/10 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ring-1 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="tabular">
              <Money minor={totalSpent} currency={currency} className={cn('font-semibold', totalSpent > totalBudget && 'text-expense')} /> /{' '}
              <Money minor={totalBudget} currency={currency} />
              <span className="text-muted-foreground"> · {totalBudget > 0 ? Math.round((totalSpent * 100) / totalBudget) : 0}%</span>
            </span>
          </div>
          <ul className="bg-card ring-foreground/10 divide-y rounded-2xl px-4 ring-1">
            {rows.map((b) => {
              const lvl = LEVEL[b.level] ?? LEVEL.ok
              const width = Math.max(0, Math.min(100, b.pct))
              return (
                <li key={b.budget_id} className="flex items-center gap-3 py-3">
                  <CategoryIcon icon={b.icon} color={b.color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{b.name}</span>
                      <span className="tabular text-muted-foreground text-xs">
                        <Money minor={b.spent} currency={currency} className={cn(b.level === 'over' && 'text-expense')} /> / <Money minor={b.amount} currency={currency} />
                      </span>
                    </div>
                    <div className="bg-muted mt-1.5 h-1.5 w-full overflow-hidden rounded-full" role="progressbar" aria-valuenow={b.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.name} budget`}>
                      <div className={cn('h-full rounded-full transition-all', lvl.bar)} style={{ width: `${width}%` }} />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                      <span className={lvl.text}>{lvl.label}</span>
                      <span className={cn('tabular', b.remaining < 0 ? 'text-expense' : 'text-muted-foreground')}>
                        {b.remaining < 0 ? 'over by ' : 'remaining '}
                        <Money minor={Math.abs(b.remaining)} currency={currency} />
                      </span>
                    </div>
                  </div>
                  <span className={cn('tabular w-10 shrink-0 text-right text-xs font-semibold', lvl.text)}>{Math.round(b.pct)}%</span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
