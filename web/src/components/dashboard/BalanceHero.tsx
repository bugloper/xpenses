import { TrendingDown, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { Money } from '@/components/common/Money'
import { ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import { formatShortDate, rangeLabel, today, type DateRange } from '@/lib/dates'
import { formatPct } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { ReportSummary } from '@/types/api'

/**
 * The head of the period's statement: the balance at the end of the period in
 * a large serif figure, beside the period's money in, money out and net set
 * as ledger columns over a bar that splits what came in from what went out.
 */
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
  if (error && !summary) {
    return (
      <section className="bg-card rounded-lg border">
        <ErrorState error={error} onRetry={onRetry} compact />
      </section>
    )
  }
  const busy = loading && !summary
  const pct = summary?.expense_change_pct ?? null
  const up = pct !== null && pct > 0
  // The balance is taken at the end of the period; a past period says which day.
  const balanceLabel = range.to < today() ? `Balance on ${formatShortDate(range.to)}` : 'Total balance'
  const income = summary?.income ?? 0
  const expenses = summary?.expenses ?? 0
  // Refunds larger than the period's spending leave it below zero: the bar
  // shows no spending then rather than a negative share.
  const flow = income + Math.max(0, expenses)
  const inShare = flow > 0 ? Math.round((income * 100) / flow) : 0
  const previous = summary
    ? rangeLabel({ from: summary.previous.from, to: summary.previous.to })
    : 'previous period'

  return (
    <section aria-label="Period summary" className="bg-card grid overflow-hidden rounded-lg border">
      <div className="flex flex-col justify-between gap-5 border-b p-5 sm:p-7">
        <div>
          <div className="eyebrow">{balanceLabel}</div>
          <div className="figure mt-3 text-[2.75rem] leading-none sm:text-[3.5rem]">
            {busy ? (
              <Skeleton className="h-12 w-56" />
            ) : (
              <span className="inline-block border-b-[3px] border-double pb-2.5">
                <Money minor={summary?.total_balance ?? 0} currency={currency} />
              </span>
            )}
          </div>
        </div>
        <p className="text-muted-foreground text-[0.8125rem]">
          Across all accounts{range.to < today() ? ' at the close of that day' : ''}.
        </p>
      </div>

      <div className="flex flex-col gap-5 p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="eyebrow">Statement · {rangeLabel(range)}</span>
          {pct !== null && (
            <span
              className={cn(
                'flex items-center gap-1 text-xs font-medium',
                up ? 'text-expense' : 'text-income',
              )}
              title={`Expenses vs ${previous}`}
            >
              {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
              Spending {formatPct(pct)} vs previous period
            </span>
          )}
        </div>

        <dl className="grid sm:grid-cols-3">
          <Column label="Income" busy={busy}>
            <Money minor={income} currency={currency} tone="income" sign="always" />
          </Column>
          <Column label="Spending" busy={busy}>
            <Money minor={-expenses} currency={currency} tone="expense" />
          </Column>
          <Column label="Net" busy={busy} total>
            <Money minor={summary?.net ?? 0} currency={currency} sign="always" />
          </Column>
        </dl>

        <div>
          <div
            className="bg-bar flex h-2 w-full gap-px overflow-hidden rounded-[2px]"
            role="img"
            aria-label={flow > 0 ? `Income ${inShare}%, spending ${100 - inShare}%` : 'No money moved'}
          >
            {flow > 0 && (
              <>
                <div className="bg-income h-full" style={{ width: `${(income * 100) / flow}%` }} />
                <div
                  className="bg-expense h-full"
                  style={{ width: `${(Math.max(0, expenses) * 100) / flow}%` }}
                />
              </>
            )}
          </div>
          <div className="eyebrow mt-2 flex justify-between gap-3" aria-hidden>
            <span className="flex items-center gap-1.5">
              <span className="bg-income size-2 rounded-[1px]" /> In {flow > 0 ? `${inShare}%` : '—'}
            </span>
            <span className="flex items-center gap-1.5">
              Out {flow > 0 ? `${100 - inShare}%` : '—'} <span className="bg-expense size-2 rounded-[1px]" />
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

/** One ledger column: a line on a phone, a column with a rule before it on wider screens. */
function Column({
  label,
  busy,
  total,
  children,
}: {
  label: string
  busy: boolean
  total?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 py-2.5 sm:block sm:py-0 sm:pl-5 sm:first:pl-0',
        'border-rule border-b last:border-b-0 sm:border-b-0 sm:border-l sm:first:border-l-0',
        total && 'max-sm:border-t-border max-sm:border-t',
      )}
    >
      <dt className="eyebrow">{label}</dt>
      <dd className={cn('figure text-xl leading-none sm:mt-2.5 sm:text-[1.75rem]', total && 'font-semibold')}>
        {busy ? <Skeleton className="h-7 w-28" /> : children}
      </dd>
    </div>
  )
}
