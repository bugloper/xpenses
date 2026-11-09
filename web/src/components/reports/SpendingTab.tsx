import { lazy, Suspense, useMemo } from 'react'
import { Meter, Panel } from '@/components/common/kit'
import { Segmented } from '@/components/common/Segmented'
import { EmptyState, ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import type { DateRange } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { useReportCashFlow } from '@/lib/queries'
import { pct1, pctOf } from '@/lib/reports'
import { periodLong } from './format'
import { ChartKey, LedgerFigures } from './ledger'

const SpendingBars = lazy(() => import('./charts').then((m) => ({ default: m.SpendingBars })))

export type SpendingGranularity = 'day' | 'week'

/** How many of the biggest days / weeks the ranked list shows. */
const TOP = 6

export function SpendingTab({
  range,
  granularity,
  onGranularity,
  currency,
}: {
  range: DateRange
  granularity: SpendingGranularity
  onGranularity: (g: SpendingGranularity) => void
  currency: string
}) {
  const q = useReportCashFlow(range.from, range.to, granularity)
  const rows = useMemo(() => q.data ?? [], [q.data])
  const stats = useMemo(() => {
    const total = rows.reduce((n, r) => n + r.expenses, 0)
    const buckets = rows.length
    const average = buckets > 0 ? Math.trunc(total / buckets) : 0
    let highest = rows[0] ?? null
    for (const r of rows) if (highest === null || r.expenses > highest.expenses) highest = r
    const active = rows.filter((r) => r.expenses > 0).length
    const ranked = rows
      .filter((r) => r.expenses > 0)
      .sort((a, b) => b.expenses - a.expenses)
      .slice(0, TOP)
    return { total, average, highest, active, ranked }
  }, [rows])
  const unit = granularity === 'day' ? 'day' : 'week'
  const m = (minor: number) => formatMoney(minor, currency)

  return (
    <div className="flex flex-col gap-6">
      <LedgerFigures
        loading={q.isPending}
        items={[
          { label: 'Total spent', value: m(stats.total), tone: 'expense' },
          { label: `Average per ${unit}`, value: m(stats.average) },
          {
            label: `Highest ${unit}`,
            value: stats.highest && stats.highest.expenses > 0 ? m(stats.highest.expenses) : '—',
            tone: stats.highest && stats.highest.expenses > 0 ? undefined : 'muted',
            hint: stats.highest && stats.highest.expenses > 0 ? periodLong(stats.highest.period) : undefined,
          },
        ]}
      />

      <div className="grid grid-cols-1 items-start gap-6">
        <Panel
          eyebrow="Expenses only"
          title={granularity === 'day' ? 'Daily spending' : 'Weekly spending'}
          action={
            <Segmented
              aria-label="Spending granularity"
              size="sm"
              className="w-auto"
              value={granularity}
              onChange={onGranularity}
              options={[
                { value: 'day', label: 'Daily' },
                { value: 'week', label: 'Weekly' },
              ]}
            />
          }
          footer={
            stats.total > 0 ? (
              <span className="text-muted-foreground">
                {stats.active} of {rows.length} {unit}s had spending. Bars above the dashed average line are
                drawn in full colour.
              </span>
            ) : undefined
          }
        >
          {q.isPending ? (
            <Skeleton className="h-[284px] w-full rounded-md" />
          ) : q.error ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
          ) : stats.total === 0 ? (
            <EmptyState title="No spending in this period" className="py-10" />
          ) : (
            <>
              <ChartKey
                className="mb-2"
                items={[
                  { label: 'Above average', color: 'var(--owed)' },
                  { label: 'At or below', color: 'color-mix(in oklch, var(--owed) 38%, transparent)' },
                  { label: `Average ${m(stats.average)}`, color: 'var(--foreground)', dashed: true },
                ]}
              />
              <Suspense fallback={<Skeleton className="h-[260px] w-full rounded-md" />}>
                <SpendingBars rows={rows} average={stats.average} currency={currency} unit={unit} />
              </Suspense>
            </>
          )}
        </Panel>

        <Panel eyebrow="Ranked" title={granularity === 'day' ? 'Biggest days' : 'Biggest weeks'} flush>
          {q.isPending ? (
            <div className="flex flex-col gap-3 p-5">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : stats.ranked.length === 0 ? (
            <p className="text-muted-foreground px-5 py-6 text-sm">Nothing spent yet.</p>
          ) : (
            <ol
              className="divide-rule divide-y"
              aria-label={granularity === 'day' ? 'Biggest days' : 'Biggest weeks'}
            >
              {stats.ranked.map((r, i) => (
                <li key={r.period} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="text-muted-foreground w-4 shrink-0 text-right font-mono text-xs tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium">{periodLong(r.period)}</span>
                      <span className="tabular shrink-0 text-sm font-medium">{m(r.expenses)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Meter
                        value={pctOf(r.expenses, stats.highest?.expenses ?? 0)}
                        tone="expense"
                        className="h-1"
                      />
                      <span className="text-muted-foreground w-11 shrink-0 text-right font-mono text-[0.6875rem] tabular-nums">
                        {pct1(r.expenses, stats.total)}%
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  )
}
