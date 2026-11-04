import { createRoute } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Plus, Target } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { BudgetFormSheet, type BudgetDraft } from '@/components/budgets/BudgetFormSheet'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { currentMonth, formatMonthLabel } from '@/lib/dates'
import { useDefaultCurrency, useReportBudgets } from '@/lib/queries'
import { isMonth, stepMonth } from '@/lib/reports'
import { cn } from '@/lib/utils'
import type { ReportBudget } from '@/types/api'
import { appRoute } from './__root'

const searchSchema = z.object({ month: z.string().optional().catch(undefined) })

const LEVEL: Record<ReportBudget['level'], { bar: string; text: string; label: string }> = {
  ok: { bar: 'bg-income', text: 'text-income', label: 'On track' },
  warn75: { bar: 'bg-warning', text: 'text-warning', label: '75% used' },
  warn90: { bar: 'bg-orange-500', text: 'text-orange-500', label: '90% used' },
  over: { bar: 'bg-expense', text: 'text-expense', label: 'Over budget' },
}

function BudgetsPage() {
  const search = budgetsRoute.useSearch()
  const navigate = budgetsRoute.useNavigate()
  const month = isMonth(search.month) ? search.month : currentMonth()
  const currency = useDefaultCurrency()
  const q = useReportBudgets(month)
  const [draft, setDraft] = useState<BudgetDraft | null | undefined>(undefined)
  const rows = q.data ?? []
  const totalBudget = rows.reduce((n, r) => n + r.amount, 0)
  const totalSpent = rows.reduce((n, r) => n + r.spent, 0)
  const setMonth = (m: string) =>
    void navigate({ search: m === currentMonth() ? {} : { month: m }, replace: true })

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Budgets"
        description="Monthly limits per category"
        actions={
          <Button size="sm" onClick={() => setDraft({})}>
            <Plus data-icon="inline-start" /> New budget
          </Button>
        }
      />
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Previous month"
          onClick={() => setMonth(stepMonth(month, -1))}
        >
          <ChevronLeft />
        </Button>
        <div className="text-center">
          <p className="font-medium">{formatMonthLabel(month)}</p>
          {month !== currentMonth() && (
            <button
              type="button"
              className="text-primary text-xs hover:underline"
              onClick={() => setMonth(currentMonth())}
            >
              Back to this month
            </button>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Next month"
          onClick={() => setMonth(stepMonth(month, 1))}
        >
          <ChevronRight />
        </Button>
      </div>
      {q.isPending ? (
        <ListSkeleton rows={5} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No budgets yet"
          description="Set a monthly limit for a category or sub-category and track it here."
          action={<Button onClick={() => setDraft({})}>Set a budget</Button>}
        />
      ) : (
        <>
          <div className="bg-card ring-foreground/10 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm ring-1">
            <span className="text-muted-foreground">Total</span>
            <span className="tabular">
              <Money
                minor={totalSpent}
                currency={currency}
                className={cn('font-semibold', totalSpent > totalBudget && 'text-expense')}
              />{' '}
              / <Money minor={totalBudget} currency={currency} />
              <span className="text-muted-foreground">
                {' '}
                · {totalBudget > 0 ? Math.round((totalSpent * 100) / totalBudget) : 0}%
              </span>
            </span>
          </div>
          <ul className="bg-card ring-foreground/10 divide-y rounded-2xl px-2 ring-1" aria-label="Budgets">
            {rows.map((b) => {
              const lvl = LEVEL[b.level] ?? LEVEL.ok
              const width = Math.max(0, Math.min(100, b.pct))
              return (
                <li key={b.budget_id}>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({ id: b.budget_id, category_id: b.category_id, amount: b.amount })
                    }
                    className="hover:bg-muted/60 flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors"
                    aria-label={`Edit ${b.name} budget`}
                  >
                    <CategoryIcon icon={b.icon} color={b.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{b.name}</span>
                        <span className="tabular text-muted-foreground text-xs">
                          <Money
                            minor={b.spent}
                            currency={currency}
                            className={cn(b.level === 'over' && 'text-expense')}
                          />{' '}
                          / <Money minor={b.amount} currency={currency} />
                        </span>
                      </div>
                      <div
                        className="bg-muted mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
                        role="progressbar"
                        aria-valuenow={b.pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${b.name} budget`}
                      >
                        <div
                          className={cn('h-full rounded-full transition-all', lvl.bar)}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                        <span className={lvl.text}>{lvl.label}</span>
                        <span
                          className={cn(
                            'tabular',
                            b.remaining < 0 ? 'text-expense' : 'text-muted-foreground',
                          )}
                        >
                          {b.remaining < 0 ? 'over by ' : 'remaining '}
                          <Money minor={Math.abs(b.remaining)} currency={currency} />
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <BudgetFormSheet
        open={draft !== undefined}
        onOpenChange={(o) => !o && setDraft(undefined)}
        draft={draft ?? null}
        currency={currency}
      />
    </div>
  )
}

export const budgetsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/budgets',
  validateSearch: searchSchema,
  component: BudgetsPage,
})
