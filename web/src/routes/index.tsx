import { createRoute, Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { z } from 'zod'
import { Suspense, lazy, useMemo } from 'react'
import { Panel } from '@/components/common/kit'
import { PageHeader, Section } from '@/components/common/PageHeader'
import { TransactionList } from '@/components/transactions/TransactionList'
import { BalanceHero } from '@/components/dashboard/BalanceHero'
import { BudgetSummary } from '@/components/dashboard/BudgetSummary'
import { CategoryBreakdown } from '@/components/dashboard/CategoryBreakdown'
import { PeriodSelector } from '@/components/dashboard/PeriodSelector'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatMonthLabel,
  granularityFor,
  isISODate,
  presetRange,
  rangeDays,
  rangeLabel,
  rangeMonth,
  trendRange,
  type PeriodPreset,
} from '@/lib/dates'
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

/** A quiet text link in a panel header: "See all", "Manage". */
function HeaderLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[0.8125rem] font-medium transition-colors"
    >
      {children}
      <ArrowRight className="size-3.5" />
    </Link>
  )
}

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
  const pending = usePendingTransactions()
  const recentGroups = useMemo(
    () => groupByDay((summary.data?.recent_transactions ?? []).slice(0, 8), pending.slice(0, 5)),
    [summary.data?.recent_transactions, pending],
  )

  const running = granularity === 'day' && rangeDays(range) > 1

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <PageHeader title="Dashboard" eyebrow={rangeLabel(range)} rule={false} />
        <div className="min-w-0">
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
        </div>
      </div>
      <BalanceHero
        summary={summary.data}
        loading={summary.isPending}
        error={summary.error}
        onRetry={() => void summary.refetch()}
        currency={currency}
        range={range}
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-12">
        <Panel
          className="md:col-span-2 lg:col-span-8"
          eyebrow={running ? 'Running totals' : granularity === 'day' ? 'By day' : 'Last six months'}
          title={running ? 'Cash flow this period' : granularity === 'day' ? 'Cash flow' : 'Monthly trend'}
          action={
            <div className="eyebrow hidden items-center gap-4 sm:flex" aria-hidden>
              <span className="flex items-center gap-1.5">
                <span className="bg-income h-0.5 w-3" /> Money in
              </span>
              <span className="flex items-center gap-1.5">
                <span className="bg-expense h-0.5 w-3" /> Money out
              </span>
            </div>
          }
        >
          <Suspense fallback={<Skeleton className="h-60 w-full rounded-md" />}>
            <CashFlowChart
              data={cashFlow.data}
              loading={cashFlow.isPending}
              error={cashFlow.error}
              onRetry={() => void cashFlow.refetch()}
              currency={currency}
              running={running}
            />
          </Suspense>
        </Panel>

        <Panel
          className="lg:col-span-4"
          eyebrow={formatMonthLabel(month)}
          title="Budgets"
          action={<HeaderLink to="/budgets">Manage</HeaderLink>}
          flush
        >
          <BudgetSummary
            data={budgets.data}
            loading={budgets.isPending}
            error={budgets.error}
            onRetry={() => void budgets.refetch()}
            currency={currency}
            month={month}
          />
        </Panel>

        <Panel className="lg:col-span-5 lg:self-start" eyebrow="Ranked" title="Spending by category" flush>
          <CategoryBreakdown
            data={categories.data}
            loading={categories.isPending}
            error={categories.error}
            onRetry={() => void categories.refetch()}
            currency={currency}
            range={range}
          />
        </Panel>

        <Section
          title="Recent transactions"
          className="md:col-span-2 lg:col-span-7"
          action={<HeaderLink to="/transactions">See all</HeaderLink>}
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
    </div>
  )
}

export const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  validateSearch: searchSchema,
  component: DashboardPage,
})
