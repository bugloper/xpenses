import { createRoute } from '@tanstack/react-router'
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { z } from 'zod'
import { BudgetFormSheet, type BudgetDraft } from '@/components/budgets/BudgetFormSheet'
import { BudgetRow } from '@/components/budgets/BudgetRow'
import { Money } from '@/components/common/Money'
import { MonthPicker } from '@/components/common/MonthPicker'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { groupBudgets } from '@/lib/budgets'
import { currentMonth } from '@/lib/dates'
import { useDefaultCurrency, useReportBudgets } from '@/lib/queries'
import { isMonth, stepMonth } from '@/lib/reports'
import { cn } from '@/lib/utils'
import type { ReportBudget } from '@/types/api'
import { appRoute } from './__root'

const searchSchema = z.object({ month: z.string().optional().catch(undefined) })

function BudgetsPage() {
  const search = budgetsRoute.useSearch()
  const navigate = budgetsRoute.useNavigate()
  const month = isMonth(search.month) ? search.month : currentMonth()
  const currency = useDefaultCurrency()
  const q = useReportBudgets(month)
  const [draft, setDraft] = useState<BudgetDraft | null | undefined>(undefined)
  const [showUnused, setShowUnused] = useState<boolean | null>(null)
  const rows = useMemo(() => q.data ?? [], [q.data])
  const groups = useMemo(() => groupBudgets(rows), [rows])
  const totalBudget = rows.reduce((n, r) => n + r.amount, 0)
  const totalSpent = rows.reduce((n, r) => n + r.spent, 0)
  // Untouched budgets stay folded away unless they are all there is.
  const unusedOpen = showUnused ?? groups.active.length === 0
  const setMonth = (m: string) => void navigate({ search: m === currentMonth() ? {} : { month: m }, replace: true })
  const edit = (b: ReportBudget) => setDraft({ id: b.budget_id, category_id: b.category_id, amount: b.amount })

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Budgets"
        description="Set a monthly limit per category and see how much of it has gone."
        actions={
          <Button size="sm" onClick={() => setDraft({})}>
            <Plus data-icon="inline-start" /> New budget
          </Button>
        }
      />
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(stepMonth(month, -1))}>
          <ChevronLeft />
        </Button>
        <div className="flex flex-col items-center">
          <MonthPicker value={month} onChange={setMonth} />
          {month !== currentMonth() && (
            <button type="button" className="text-primary text-xs hover:underline" onClick={() => setMonth(currentMonth())}>
              Back to this month
            </button>
          )}
        </div>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setMonth(stepMonth(month, 1))}>
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
          <div className="bg-card border flex items-center justify-between gap-3 rounded-[1.25rem] px-4 py-3 text-sm">
            <span className="text-muted-foreground">Spent this month</span>
            <span className="tabular">
              <Money minor={totalSpent} currency={currency} className={cn('font-semibold', totalSpent > totalBudget && 'text-expense')} /> /{' '}
              <Money minor={totalBudget} currency={currency} />
              <span className="text-muted-foreground"> · {totalBudget > 0 ? Math.round((totalSpent * 100) / totalBudget) : 0}%</span>
            </span>
          </div>
          {groups.active.length > 0 && (
            <ul className="bg-card border divide-y rounded-[1.25rem] px-2" aria-label="Budgets in use">
              {groups.active.map((b) => (
                <BudgetRow key={b.budget_id} b={b} currency={currency} onEdit={() => edit(b)} />
              ))}
            </ul>
          )}
          {groups.unused.length > 0 && (
            <section className="bg-card border rounded-[1.25rem] px-2">
              <button
                type="button"
                aria-expanded={unusedOpen}
                onClick={() => setShowUnused(!unusedOpen)}
                className="flex w-full items-center justify-between gap-2 px-2 py-3 text-left text-sm"
              >
                <span className="font-medium">
                  Not used yet <span className="text-muted-foreground font-normal">· {groups.unused.length}</span>
                </span>
                <ChevronDown className={cn('text-muted-foreground size-4 transition-transform', unusedOpen && 'rotate-180')} />
              </button>
              {unusedOpen && (
                <ul className="divide-y border-t" aria-label="Budgets not used yet">
                  {groups.unused.map((b) => (
                    <BudgetRow key={b.budget_id} b={b} currency={currency} onEdit={() => edit(b)} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
      <BudgetFormSheet open={draft !== undefined} onOpenChange={(o) => !o && setDraft(undefined)} draft={draft ?? null} currency={currency} />
    </div>
  )
}

export const budgetsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/budgets',
  validateSearch: searchSchema,
  component: BudgetsPage,
})
