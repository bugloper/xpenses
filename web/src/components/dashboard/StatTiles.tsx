import { ArrowDownLeft, ArrowUpRight, Scale, TrendingDown, TrendingUp } from 'lucide-react'
import { Money } from '@/components/common/Money'
import { ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import { rangeLabel, type DateRange } from '@/lib/dates'
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
  return (
    <div className="bg-card ring-foreground/10 rounded-2xl p-5 ring-1 lg:p-6">
      {error && !summary ? (
        <ErrorState error={error} onRetry={onRetry} compact />
      ) : (
        <>
          <p className="text-muted-foreground text-sm">Total balance</p>
          {loading && !summary ? (
            <Skeleton className="mt-2 h-10 w-48" />
          ) : (
            <Money
              minor={summary?.total_balance ?? 0}
              currency={currency}
              className="mt-1 block text-4xl font-semibold tracking-tight lg:text-5xl"
            />
          )}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Tile
              label="Income"
              icon={ArrowDownLeft}
              tone="income"
              loading={loading && !summary}
              value={
                <Money
                  minor={summary?.income ?? 0}
                  currency={currency}
                  sign="always"
                  tone="income"
                  className="text-lg font-semibold"
                />
              }
            />
            <Tile
              label="Expenses"
              icon={ArrowUpRight}
              tone="expense"
              loading={loading && !summary}
              value={
                <Money
                  minor={-(summary?.expenses ?? 0)}
                  currency={currency}
                  tone="expense"
                  className="text-lg font-semibold"
                />
              }
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Scale className="size-4" /> Net cash flow
              <Money
                minor={summary?.net ?? 0}
                currency={currency}
                tone="auto"
                sign="always"
                className="font-medium"
              />
            </span>
            {pct !== null && (
              <span
                className={cn(
                  'flex items-center gap-1 text-xs font-medium',
                  up ? 'text-expense' : 'text-income',
                )}
                title={`Expenses vs ${summary ? rangeLabel({ from: summary.previous.from, to: summary.previous.to }) : 'previous period'}`}
              >
                {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                {formatPct(pct)} vs previous period
              </span>
            )}
          </div>
          <p className="sr-only">{rangeLabel(range)}</p>
        </>
      )}
    </div>
  )
}

function Tile({
  label,
  icon: Icon,
  tone,
  value,
  loading,
}: {
  label: string
  icon: typeof ArrowDownLeft
  tone: 'income' | 'expense'
  value: React.ReactNode
  loading: boolean
}) {
  return (
    <div className="bg-muted/50 rounded-xl p-3">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <span
          className={cn(
            'flex size-5 items-center justify-center rounded-md',
            tone === 'income' ? 'bg-income/15 text-income' : 'bg-expense/15 text-expense',
          )}
        >
          <Icon className="size-3" />
        </span>
        {label}
      </div>
      {loading ? <Skeleton className="mt-2 h-6 w-24" /> : <div className="mt-1">{value}</div>}
    </div>
  )
}
