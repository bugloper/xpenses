import { lazy, Suspense, useMemo } from 'react'
import { Money } from '@/components/common/Money'
import { Segmented } from '@/components/common/Segmented'
import { EmptyState, ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import { formatPeriodTick, type DateRange } from '@/lib/dates'
import { useReportCashFlow } from '@/lib/queries'

const SpendingBars = lazy(() => import('./charts').then((m) => ({ default: m.SpendingBars })))

export type SpendingGranularity = 'day' | 'week'

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
    return { total, average, highest, active }
  }, [rows])
  const unit = granularity === 'day' ? 'day' : 'week'
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        aria-label="Spending granularity"
        value={granularity}
        onChange={onGranularity}
        options={[
          { value: 'day', label: 'Daily' },
          { value: 'week', label: 'Weekly' },
        ]}
      />
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="Total spent"
          value={<Money minor={stats.total} currency={currency} tone="expense" className="font-semibold" />}
          loading={q.isPending}
        />
        <Stat
          label={`Average per ${unit}`}
          value={<Money minor={stats.average} currency={currency} className="font-semibold" />}
          loading={q.isPending}
        />
        <Stat
          label={`Highest ${unit}`}
          value={
            stats.highest && stats.highest.expenses > 0 ? (
              <>
                <Money minor={stats.highest.expenses} currency={currency} className="font-semibold" />
                <span className="text-muted-foreground block text-[11px]">
                  {formatPeriodTick(stats.highest.period)} · {stats.highest.period}
                </span>
              </>
            ) : (
              '—'
            )
          }
          loading={q.isPending}
        />
      </div>
      <section className="bg-card ring-foreground/10 flex flex-col gap-3 rounded-2xl p-4 ring-1">
        <h2 className="text-sm font-medium">
          {granularity === 'day' ? 'Daily spending' : 'Weekly spending'}
        </h2>
        {q.isPending ? (
          <Skeleton className="h-56 w-full rounded-xl" />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
        ) : stats.total === 0 ? (
          <EmptyState title="No spending in this period" className="py-8" />
        ) : (
          <Suspense fallback={<Skeleton className="h-56 w-full rounded-xl" />}>
            <SpendingBars rows={rows} average={stats.average} currency={currency} />
          </Suspense>
        )}
        {stats.total > 0 && (
          <p className="text-muted-foreground text-xs">
            {stats.active} of {rows.length} {unit}s had spending. Bars above the dashed average line are red.
          </p>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, loading }: { label: string; value: React.ReactNode; loading: boolean }) {
  return (
    <div className="bg-card ring-foreground/10 flex flex-col rounded-2xl px-3 py-2.5 ring-1">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      {loading ? <Skeleton className="mt-1 h-5 w-20" /> : <span className="tabular text-sm">{value}</span>}
    </div>
  )
}
