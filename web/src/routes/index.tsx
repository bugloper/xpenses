import { createRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { Suspense, lazy, useMemo, useState } from 'react'
import { BudgetFormSheet, type BudgetDraft } from '@/components/budgets/BudgetFormSheet'
import { PageHeader, Section } from '@/components/common/PageHeader'
import { TransactionList } from '@/components/transactions/TransactionList'
import { BudgetList } from '@/components/dashboard/BudgetList'
import { Skeleton } from '@/components/ui/skeleton'
import { PeriodSelector } from '@/components/dashboard/PeriodSelector'
import { BalanceHero } from '@/components/dashboard/StatTiles'
import { Button } from '@/components/ui/button'
import {
  formatMonthLabel,
  granularityFor,
  isISODate,
  presetRange,
  rangeLabel,
  rangeMonth,
  trendRange,
  type PeriodPreset,
} from '@/lib/dates'
import { groupBudgets, overLimitLabel } from '@/lib/budgets'
import { usePendingTransactions } from '@/lib/offline'
import {
  useDefaultCurrency,
  useReportBudgets,
  useReportCashFlow,
  useReportCategories,
  useReportSummary,
} from '@/lib/queries'
import { groupByDay } from '@/lib/transactions'
import { appRoute } from './__root'

// Recharts is the heaviest dependency: load it only when the dashboard renders.
const CashFlowChart = lazy(() =>
  import('@/components/dashboard/CashFlowChart').then((m) => ({ default: m.CashFlowChart })),
)
const CategoryDonut = lazy(() =>
  import('@/components/dashboard/CategoryDonut').then((m) => ({ default: m.CategoryDonut })),
)

const searchSchema = z.object({
  period: z.enum(['today', 'week', 'month', 'prev_month', 'custom']).optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
})

function DashboardPage() {
  const search = dashboardRoute.useSearch()
  const navigate = dashboardRoute.useNavigate()
  const currency = useDefaultCurrency()
  const preset: PeriodPreset = search.period ?? 'month'
  const range = useMemo(() => {
    if (preset === 'custom' && search.from && search.to && isISODate(search.from) && isISODate(search.to))
      return { from: search.from, to: search.to }
    return presetRange(preset === 'custom' ? 'month' : preset)
  }, [preset, search.from, search.to])

  const summary = useReportSummary(range.from, range.to)
  const trend = trendRange(range)
  const granularity = granularityFor(range)
  const cashFlow = useReportCashFlow(
    granularity === 'day' ? range.from : trend.from,
    granularity === 'day' ? range.to : trend.to,
    granularity === 'day' ? 'day' : 'month',
  )
  const categories = useReportCategories(range.from, range.to, 'expense')
  const month = rangeMonth(range)
  const budgets = useReportBudgets(month)
  const overCount = useMemo(() => groupBudgets(budgets.data ?? []).over.length, [budgets.data])
  const [draft, setDraft] = useState<BudgetDraft | null | undefined>(undefined)
  const pending = usePendingTransactions()
  const recentGroups = useMemo(
    () => groupByDay((summary.data?.recent_transactions ?? []).slice(0, 8), pending.slice(0, 5)),
    [summary.data?.recent_transactions, pending],
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description={rangeLabel(range)} />
      <PeriodSelector
        preset={preset}
        range={range}
        onChange={(p, r) =>
          void navigate({
            search:
              p === 'custom'
                ? { period: 'custom', from: r.from, to: r.to }
                : p === 'month'
                  ? {}
                  : { period: p },
            replace: true,
          })
        }
      />
      <BalanceHero
        summary={summary.data}
        loading={summary.isPending}
        error={summary.error}
        onRetry={() => void summary.refetch()}
        currency={currency}
        range={range}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={granularity === 'day' ? 'Daily cash flow' : 'Monthly trend'}>
          <div className="bg-card border rounded-[1.25rem] p-4">
            <Suspense fallback={<Skeleton className="h-56 w-full rounded-xl" />}>
              <CashFlowChart
                data={cashFlow.data}
                loading={cashFlow.isPending}
                error={cashFlow.error}
                onRetry={() => void cashFlow.refetch()}
                currency={currency}
              />
            </Suspense>
          </div>
        </Section>
        <Section
          title={`Budgets · ${formatMonthLabel(month)}`}
          action={
            <span className="flex items-center gap-3">
              {overCount > 0 && (
                <span className="text-expense hidden text-xs font-medium sm:inline">{overLimitLabel(overCount)}</span>
              )}
              <Button variant="link" size="sm" className="h-auto p-0" asChild>
                <Link to="/budgets">Manage</Link>
              </Button>
            </span>
          }
        >
          <div className="bg-card border rounded-[1.25rem] p-4">
            <BudgetList
              data={budgets.data}
              loading={budgets.isPending}
              error={budgets.error}
              onRetry={() => void budgets.refetch()}
              currency={currency}
              onEdit={(b) => setDraft({ id: b.budget_id, category_id: b.category_id, amount: b.amount })}
            />
          </div>
        </Section>
        <Section title="Spending by category" className="lg:col-span-2">
          <div className="bg-card border rounded-[1.25rem] p-4 sm:p-5">
            <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
              <CategoryDonut
                data={categories.data}
                loading={categories.isPending}
                error={categories.error}
                onRetry={() => void categories.refetch()}
                currency={currency}
                range={range}
              />
            </Suspense>
          </div>
        </Section>
        <Section
          title="Recent transactions"
          className="lg:col-span-2"
          action={
            <Button variant="link" size="sm" className="h-auto p-0" asChild>
              <Link to="/transactions">See all</Link>
            </Button>
          }
        >
          <TransactionList
            groups={recentGroups}
            loading={summary.isPending}
            error={summary.error}
            onRetry={() => void summary.refetch()}
            currency={currency}
            emptyTitle="Nothing yet"
            emptyDescription="Your latest transactions will appear here."
          />
        </Section>
      </div>
      <BudgetFormSheet open={draft !== undefined} onOpenChange={(o) => !o && setDraft(undefined)} draft={draft ?? null} currency={currency} />
    </div>
  )
}

export const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  validateSearch: searchSchema,
  component: DashboardPage,
})
