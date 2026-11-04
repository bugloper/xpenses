import { ArrowDownLeft, ArrowUpRight, Scale, TrendingDown, TrendingUp } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Money } from '@/components/common/Money'
import { Segmented } from '@/components/common/Segmented'
import { ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import { rangeLabel, type DateRange } from '@/lib/dates'
import { formatPct } from '@/lib/money'
import { useReportCashFlow, useReportSummary } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { CashFlowGranularity } from '@/types/api'

const CashFlowChart = lazy(() =>
  import('@/components/dashboard/CashFlowChart').then((m) => ({ default: m.CashFlowChart })),
)

export function OverviewTab({
  range,
  granularity,
  onGranularity,
  currency,
}: {
  range: DateRange
  granularity: CashFlowGranularity
  onGranularity: (g: CashFlowGranularity) => void
  currency: string
}) {
  const summary = useReportSummary(range.from, range.to)
  const cashFlow = useReportCashFlow(range.from, range.to, granularity)
  const s = summary.data
  const pct = s?.expense_change_pct ?? null
  const up = pct !== null && pct > 0
  return (
    <div className="flex flex-col gap-4">
      {summary.error && !s ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} compact />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Income" icon={ArrowDownLeft} tone="income" loading={summary.isPending}>
            <Money
              minor={s?.income ?? 0}
              currency={currency}
              tone="income"
              sign="always"
              className="text-lg font-semibold"
            />
          </Tile>
          <Tile label="Expenses" icon={ArrowUpRight} tone="expense" loading={summary.isPending}>
            <Money
              minor={-(s?.expenses ?? 0)}
              currency={currency}
              tone="expense"
              className="text-lg font-semibold"
            />
          </Tile>
          <Tile label="Net" icon={Scale} tone="neutral" loading={summary.isPending}>
            <Money
              minor={s?.net ?? 0}
              currency={currency}
              tone="auto"
              sign="always"
              className="text-lg font-semibold"
            />
          </Tile>
          <Tile
            label="Expenses vs previous"
            icon={up ? TrendingUp : TrendingDown}
            tone={up ? 'expense' : 'income'}
            loading={summary.isPending}
          >
            <span
              className={cn(
                'text-lg font-semibold',
                pct === null ? 'text-muted-foreground' : up ? 'text-expense' : 'text-income',
              )}
            >
              {formatPct(pct)}
            </span>
            {s && (
              <span
                className="text-muted-foreground block text-[11px]"
                title={rangeLabel({ from: s.previous.from, to: s.previous.to })}
              >
                prev <Money minor={-s.previous.expenses} currency={currency} />
              </span>
            )}
          </Tile>
        </div>
      )}
      <section className="bg-card ring-foreground/10 flex flex-col gap-3 rounded-2xl p-4 ring-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Income vs expenses</h2>
          <Segmented
            aria-label="Granularity"
            size="sm"
            className="w-auto"
            value={granularity}
            onChange={onGranularity}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
        </div>
        <Suspense fallback={<Skeleton className="h-56 w-full rounded-xl" />}>
          <CashFlowChart
            data={cashFlow.data}
            loading={cashFlow.isPending}
            error={cashFlow.error}
            onRetry={() => void cashFlow.refetch()}
            currency={currency}
          />
        </Suspense>
        {s && (
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>
              Previous period:{' '}
              <Money minor={s.previous.income} currency={currency} tone="income" sign="always" /> ·{' '}
              <Money minor={-s.previous.expenses} currency={currency} tone="expense" /> · net{' '}
              <Money minor={s.previous.net} currency={currency} tone="auto" sign="always" />
            </span>
          </div>
        )}
      </section>
    </div>
  )
}

function Tile({
  label,
  icon: Icon,
  tone,
  loading,
  children,
}: {
  label: string
  icon: typeof Scale
  tone: 'income' | 'expense' | 'neutral'
  loading: boolean
  children: React.ReactNode
}) {
  return (
    <div className="bg-card ring-foreground/10 rounded-2xl p-3 ring-1">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <span
          className={cn(
            'flex size-5 items-center justify-center rounded-md',
            tone === 'income' && 'bg-income/15 text-income',
            tone === 'expense' && 'bg-expense/15 text-expense',
            tone === 'neutral' && 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="size-3" />
        </span>
        {label}
      </div>
      {loading ? <Skeleton className="mt-2 h-6 w-24" /> : <div className="mt-1">{children}</div>}
    </div>
  )
}
