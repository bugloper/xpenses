import { lazy, Suspense } from 'react'
import { Panel } from '@/components/common/kit'
import { Segmented } from '@/components/common/Segmented'
import { EmptyState, ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import { rangeLabel, type DateRange } from '@/lib/dates'
import { formatMoney, formatPct } from '@/lib/money'
import { useReportCashFlow, useReportSummary } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { CashFlowGranularity, ReportSummary } from '@/types/api'
import { shortDate } from './format'
import { ChartKey, LedgerFigures } from './ledger'

const CashFlowBars = lazy(() => import('./charts').then((m) => ({ default: m.CashFlowBars })))

/** Percentage change from `prev` to `cur`, or null when there is nothing to compare with. */
function change(cur: number, prev: number): number | null {
  if (prev === 0) return null
  return ((cur - prev) * 100) / Math.abs(prev)
}

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
  const money = (minor: number, sign: 'auto' | 'always' = 'auto') => formatMoney(minor, currency, { sign })
  const flow = cashFlow.data ?? []
  const quiet = flow.length === 0 || flow.every((r) => r.income === 0 && r.expenses === 0)

  return (
    <div className="flex flex-col gap-6">
      {summary.error && !s ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} compact />
      ) : (
        <>
          {s && <Summary s={s} range={range} currency={currency} />}
          <LedgerFigures
            loading={summary.isPending}
            items={[
              { label: 'Income', value: money(s?.income ?? 0), tone: 'income' },
              { label: 'Expenses', value: money(s?.expenses ?? 0), tone: 'expense' },
              {
                label: 'Net',
                value: money(s?.net ?? 0, 'always'),
                tone: (s?.net ?? 0) > 0 ? 'income' : (s?.net ?? 0) < 0 ? 'expense' : undefined,
              },
              {
                label: 'Expenses vs previous',
                value: formatPct(pct),
                tone: pct === null ? 'muted' : up ? 'expense' : 'income',
                hint: s && (
                  <span title={rangeLabel({ from: s.previous.from, to: s.previous.to })}>
                    Previous {money(s.previous.expenses)}
                  </span>
                ),
              },
            ]}
          />
        </>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <Panel
          className="lg:col-span-8"
          eyebrow="Cash flow"
          title="Income and expenses"
          action={
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
          }
        >
          {cashFlow.isPending && !cashFlow.data ? (
            <Skeleton className="h-[284px] w-full rounded-md" />
          ) : cashFlow.error && !cashFlow.data ? (
            <ErrorState error={cashFlow.error} onRetry={() => void cashFlow.refetch()} compact />
          ) : quiet ? (
            <EmptyState
              title="Nothing recorded in this period"
              description="Income and expenses will show up here."
              className="py-10"
            />
          ) : (
            <Suspense fallback={<Skeleton className="h-[284px] w-full rounded-md" />}>
              <ChartKey
                className="mb-2"
                items={[
                  { label: 'Income', color: 'var(--paid)' },
                  { label: 'Expenses', color: 'var(--owed)' },
                ]}
              />
              <CashFlowBars rows={flow} currency={currency} />
            </Suspense>
          )}
        </Panel>

        <Panel
          className="lg:col-span-4"
          eyebrow={
            s ? `Previous · ${rangeLabel({ from: s.previous.from, to: s.previous.to })}` : 'Previous period'
          }
          title="Against the previous period"
          flush
        >
          {summary.isPending ? (
            <div className="flex flex-col gap-3 p-5">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : s ? (
            <div className="divide-rule divide-y">
              <Compare
                label="Income"
                cur={s.income}
                prev={s.previous.income}
                pct={change(s.income, s.previous.income)}
                goodWhenUp
                currency={currency}
              />
              <Compare
                label="Expenses"
                cur={s.expenses}
                prev={s.previous.expenses}
                pct={pct}
                currency={currency}
              />
              <Compare
                label="Net"
                cur={s.net}
                prev={s.previous.net}
                pct={change(s.net, s.previous.net)}
                goodWhenUp
                signed
                currency={currency}
              />
            </div>
          ) : (
            <p className="text-muted-foreground p-5 text-sm">Not available.</p>
          )}
        </Panel>
      </div>
    </div>
  )
}

/** One plain sentence built from the figures, set as the statement's lede. */
function Summary({ s, range, currency }: { s: ReportSummary; range: DateRange; currency: string }) {
  const m = (minor: number) => formatMoney(minor, currency)
  const span =
    range.from === range.to
      ? `On ${shortDate(range.from)}`
      : `From ${shortDate(range.from)} to ${shortDate(range.to)}`
  if (s.income === 0 && s.expenses === 0)
    return (
      <p className="font-display text-muted-foreground max-w-3xl text-xl leading-snug">
        {span}, nothing was recorded.
      </p>
    )
  const pct = s.expense_change_pct
  const net =
    s.net > 0 ? (
      <>
        , keeping <Strong tone="income">{m(s.net)}</Strong>
      </>
    ) : s.net < 0 ? (
      <>
        , <Strong tone="expense">{m(-s.net)}</Strong> more than came in
      </>
    ) : (
      ', exactly what came in'
    )
  return (
    <p className="font-display max-w-3xl text-[1.25rem] leading-snug text-pretty sm:text-[1.5rem]">
      {span} you received <Strong tone="income">{m(s.income)}</Strong> and spent{' '}
      <Strong tone="expense">{m(s.expenses)}</Strong>
      {net}.
      {pct !== null && Number.isFinite(pct) && (
        <span className="text-muted-foreground">
          {' '}
          {Math.round(pct * 10) === 0
            ? 'Spending was the same as the period before.'
            : `Spending was ${formatPct(Math.abs(pct)).replace('+', '')} ${pct > 0 ? 'higher' : 'lower'} than the period before.`}
        </span>
      )}
    </p>
  )
}

function Strong({ tone, children }: { tone: 'income' | 'expense'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'tabular font-medium whitespace-nowrap',
        tone === 'income' ? 'text-income' : 'text-expense',
      )}
    >
      {children}
    </span>
  )
}

function Compare({
  label,
  cur,
  prev,
  pct,
  goodWhenUp,
  signed,
  currency,
}: {
  label: string
  cur: number
  prev: number
  pct: number | null
  goodWhenUp?: boolean
  signed?: boolean
  currency: string
}) {
  const sign = signed ? 'always' : 'auto'
  const rose = pct !== null && pct > 0
  const tone =
    pct === null || Math.round(pct * 10) === 0
      ? 'text-muted-foreground'
      : rose === !!goodWhenUp
        ? 'text-income'
        : 'text-expense'
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <div className="eyebrow">{label}</div>
        <div className="figure mt-1.5 text-xl leading-none">{formatMoney(cur, currency, { sign })}</div>
        <div className="text-muted-foreground mt-1.5 text-xs">
          Previous <span className="tabular">{formatMoney(prev, currency, { sign })}</span>
        </div>
      </div>
      <div className={cn('tabular shrink-0 pt-5 font-mono text-[0.8125rem]', tone)}>{formatPct(pct)}</div>
    </div>
  )
}
