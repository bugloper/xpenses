import { ArrowDownLeft, ArrowUpRight, Scale, TrendingDown, TrendingUp } from 'lucide-react'
import { Money } from '@/components/common/Money'
import { BigAmount, Panel, Stat, StatGrid } from '@/components/common/kit'
import { ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import { formatShortDate, rangeLabel, today, type DateRange } from '@/lib/dates'
import { formatPct } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { ReportSummary } from '@/types/api'

export function BalanceHero({
  summary,
  loading,
  error,
  onRetry,
  currency,
  range,
}: {
  summary?: ReportSummary
  loading: boolean
  error: unknown
  onRetry: () => void
  currency: string
  range: DateRange
}) {
  const pct = summary?.expense_change_pct ?? null
  const up = pct !== null && pct > 0
  if (error && !summary) {
    return (
      <Panel>
        <ErrorState error={error} onRetry={onRetry} compact />
      </Panel>
    )
  }
  const busy = loading && !summary
  // The balance is taken at the end of the period; a past period says which day.
  const balanceLabel = range.to < today() ? `Balance on ${formatShortDate(range.to)}` : 'Total balance'
  return (
    <div className="grid gap-3">
      <Panel>
        <BigAmount label={balanceLabel}>
          {busy ? <Skeleton className="h-10 w-48" /> : <Money minor={summary?.total_balance ?? 0} currency={currency} />}
        </BigAmount>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Scale className="size-4" /> Net cash flow
            <Money minor={summary?.net ?? 0} currency={currency} tone="auto" sign="always" className="font-medium" />
          </span>
          {pct !== null && (
            <span
              className={cn('flex items-center gap-1 text-xs font-medium', up ? 'text-expense' : 'text-income')}
              title={`Expenses vs ${summary ? rangeLabel({ from: summary.previous.from, to: summary.previous.to }) : 'previous period'}`}
            >
              {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
              {formatPct(pct)} vs previous period
            </span>
          )}
        </div>
        <p className="sr-only">{rangeLabel(range)}</p>
      </Panel>
      <StatGrid className="lg:grid-cols-2">
        <Stat
          label="Income"
          icon={ArrowDownLeft}
          tone="income"
          value={busy ? <Skeleton className="h-7 w-28" /> : <Money minor={summary?.income ?? 0} currency={currency} sign="always" />}
        />
        <Stat
          label="Expenses"
          icon={ArrowUpRight}
          tone="expense"
          value={busy ? <Skeleton className="h-7 w-28" /> : <Money minor={-(summary?.expenses ?? 0)} currency={currency} />}
        />
      </StatGrid>
    </div>
  )
}
