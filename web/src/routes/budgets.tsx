import { createRoute } from '@tanstack/react-router'
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Target } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { BudgetFormSheet, type BudgetDraft } from '@/components/budgets/BudgetFormSheet'
import { BudgetRow, BudgetTableHead } from '@/components/budgets/BudgetRow'
import { Meter } from '@/components/common/kit'
import { Money } from '@/components/common/Money'
import { MonthPicker } from '@/components/common/MonthPicker'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { groupBudgets } from '@/lib/budgets'
import { currentMonth, formatMonthLabel } from '@/lib/dates'
import { useDefaultCurrency, useReportBudgets } from '@/lib/queries'
import { isMonth, stepMonth } from '@/lib/reports'
import { cn } from '@/lib/utils'
import type { ReportBudget } from '@/types/api'
import { appRoute } from './__root'

const searchSchema = z.object({ month: z.string().optional().catch(undefined) })

/** One cell of the summary strip: a mono label over a serif figure. */
function Figure({
  label,
  children,
  hint,
  className,
  figureClassName,
}: {
  label: string
  children: ReactNode
  hint?: ReactNode
  className?: string
  figureClassName?: string
}) {
  return (
    <div className={cn('border-rule min-w-0 px-4 py-4 sm:px-5', className)}>
      <div className="eyebrow">{label}</div>
      <div className={cn('figure mt-2 text-[1.5rem] leading-none sm:text-[1.75rem]', figureClassName)}>
        {children}
      </div>
      {hint && <div className="text-muted-foreground mt-2 text-xs">{hint}</div>}
    </div>
  )
}

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
  const totalPct = totalBudget > 0 ? Math.round((totalSpent * 100) / totalBudget) : 0
  const totalLeft = totalBudget - totalSpent
  // Untouched budgets stay folded away unless they are all there is.
  const unusedOpen = showUnused ?? groups.active.length === 0
  const isThisMonth = month === currentMonth()
  const setMonth = (m: string) =>
    void navigate({ search: m === currentMonth() ? {} : { month: m }, replace: true })
  const edit = (b: ReportBudget) =>
    setDraft({ id: b.budget_id, category_id: b.category_id, amount: b.amount })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Budgets"
        eyebrow="Monthly limits"
        description="A limit per category, and how much of it has gone."
        actions={
          <Button onClick={() => setDraft({})}>
            <Plus data-icon="inline-start" /> New budget
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => setMonth(stepMonth(month, -1))}
          >
            <ChevronLeft />
          </Button>
          <MonthPicker
            value={month}
            onChange={setMonth}
            className="min-w-36 justify-center text-[1.375rem]"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => setMonth(stepMonth(month, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        {isThisMonth ? (
          <span className="eyebrow text-accent-foreground flex items-center gap-1.5">
            <span aria-hidden className="bg-saffron size-1.5 rounded-full" /> This month
          </span>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setMonth(currentMonth())}>
            Back to this month
          </Button>
        )}
      </div>

      {q.isPending ? (
        <ListSkeleton rows={5} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <div className="bg-card rounded-lg border">
          <EmptyState
            icon={Target}
            title="No budgets yet"
            description="Set a monthly limit for a category or sub-category and track it here."
            action={<Button onClick={() => setDraft({})}>Set a budget</Button>}
          />
        </div>
      ) : (
        <>
          <section
            aria-label="Month summary"
            className="bg-card grid grid-cols-2 rounded-lg border md:grid-cols-4"
          >
            <Figure
              label={isThisMonth ? 'Spent this month' : `Spent in ${formatMonthLabel(month)}`}
              hint={
                <>
                  of <Money minor={totalBudget} currency={currency} /> in limits
                </>
              }
            >
              <Money
                minor={totalSpent}
                currency={currency}
                className={cn(totalSpent > totalBudget && 'text-expense')}
              />
            </Figure>
            <Figure
              label="Used"
              className="border-l"
              figureClassName={cn(totalSpent > totalBudget && 'text-expense')}
              hint={
                <Meter
                  value={totalPct}
                  tone={totalSpent > totalBudget ? 'expense' : 'ink'}
                  className="mt-1"
                />
              }
            >
              {totalPct}%
            </Figure>
            <Figure
              label={totalLeft < 0 ? 'Over by' : 'Left'}
              hint="across every budget"
              className="border-t md:border-t-0 md:border-l"
            >
              <Money
                minor={Math.abs(totalLeft)}
                currency={currency}
                className={cn(totalLeft < 0 && 'text-expense')}
              />
            </Figure>
            <Figure
              label="Over the limit"
              className="border-t border-l md:border-t-0"
              figureClassName={cn(groups.over.length > 0 && 'text-expense')}
              hint={groups.over.length > 0 ? 'marked in red below' : 'all within their limits'}
            >
              {groups.over.length}
              <span className="text-muted-foreground font-sans text-sm font-normal tracking-normal">
                {' '}
                of {rows.length}
              </span>
            </Figure>
          </section>

          {groups.active.length > 0 && (
            <section className="bg-card overflow-hidden rounded-lg border">
              <header className="flex items-baseline justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
                <h2 className="font-display text-[1.1875rem] leading-tight">In use</h2>
                <span className="eyebrow">
                  {groups.active.length} {groups.active.length === 1 ? 'budget' : 'budgets'} · most used first
                </span>
              </header>
              <BudgetTableHead />
              <ul className="divide-rule divide-y" aria-label="Budgets in use">
                {groups.active.map((b) => (
                  <BudgetRow key={b.budget_id} b={b} currency={currency} onEdit={() => edit(b)} />
                ))}
              </ul>
            </section>
          )}

          {groups.unused.length > 0 && (
            <section className="bg-card overflow-hidden rounded-lg border">
              <button
                type="button"
                aria-expanded={unusedOpen}
                onClick={() => setShowUnused(!unusedOpen)}
                className="hover:bg-muted/55 flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors sm:px-5"
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-display text-[1.1875rem] leading-tight">Not used yet</span>
                  <span className="eyebrow">· {groups.unused.length}</span>
                </span>
                <span className="text-muted-foreground flex items-center gap-2 text-[0.8125rem]">
                  <span className="hidden sm:inline">{unusedOpen ? 'Hide' : 'Show'}</span>
                  <ChevronDown className={cn('size-4 transition-transform', unusedOpen && 'rotate-180')} />
                </span>
              </button>
              {unusedOpen && (
                <div className="border-t">
                  <BudgetTableHead />
                  <ul className="divide-rule divide-y" aria-label="Budgets not used yet">
                    {groups.unused.map((b) => (
                      <BudgetRow key={b.budget_id} b={b} currency={currency} onEdit={() => edit(b)} />
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
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
