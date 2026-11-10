import { lazy, Suspense, useMemo } from 'react'
import { Panel } from '@/components/common/kit'
import { ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import { twelveMonthsTo, type DateRange } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { useReportCashFlow, useReportSummary } from '@/lib/queries'
import { CategoriesTab } from './CategoriesTab'
import { ChartKey, LedgerFigures } from './ledger'

const SeriesBars = lazy(() => import('./charts').then((m) => ({ default: m.SeriesBars })))

/**
 * Income only: what was earned (never transfers, borrowed money or loans
 * paid back), where it came from, and the last twelve months of it.
 */
export function IncomeTab({ range, currency }: { range: DateRange; currency: string }) {
  const summary = useReportSummary(range.from, range.to)
  const year = twelveMonthsTo(range)
  const trend = useReportCashFlow(year.from, year.to, 'month')
  const rows = useMemo(
    () => (trend.data ?? []).map((r) => ({ period: r.period, income: r.income })),
    [trend.data],
  )
  const earning = rows.filter((r) => r.income > 0)
  const average = earning.length ? Math.trunc(earning.reduce((n, r) => n + r.income, 0) / earning.length) : 0
  const s = summary.data
  const change =
    s && s.previous.income > 0 ? Math.round(((s.income - s.previous.income) * 100) / s.previous.income) : null
  const m = (v: number) => formatMoney(v, currency)

  return (
    <div className="flex flex-col gap-6">
      <LedgerFigures
        loading={summary.isPending}
        items={[
          { label: 'Income this period', value: s ? m(s.income) : '—', tone: 'income' },
          {
            label: 'Previous period',
            value: s ? m(s.previous.income) : '—',
            hint: change === null ? undefined : `${change >= 0 ? 'Up' : 'Down'} ${Math.abs(change)}% since`,
          },
          {
            label: 'Monthly average',
            value: m(average),
            hint: `Months with income, last ${rows.length}`,
          },
        ]}
      />
      <CategoriesTab range={range} type="income" currency={currency} />
      <Panel
        eyebrow="Last twelve months"
        title="Income by month"
        action={<ChartKey items={[{ label: 'Income', color: 'var(--paid)' }]} />}
      >
        {trend.error ? (
          <ErrorState error={trend.error} onRetry={() => void trend.refetch()} compact />
        ) : trend.isPending ? (
          <Skeleton className="h-60 w-full" />
        ) : (
          <Suspense fallback={<Skeleton className="h-60 w-full" />}>
            <SeriesBars
              rows={rows}
              series={[{ key: 'income', label: 'Income', color: 'var(--paid)' }]}
              currency={currency}
            />
          </Suspense>
        )}
      </Panel>
    </div>
  )
}
