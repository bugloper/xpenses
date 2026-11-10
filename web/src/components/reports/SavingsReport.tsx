import { lazy, Suspense, useMemo } from 'react'
import { Meter, Panel, Row, Rows } from '@/components/common/kit'
import { Money } from '@/components/common/Money'
import { EmptyState, ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import { formatShortDate, today, twelveMonthsTo, type DateRange } from '@/lib/dates'
import { goalPace } from '@/lib/insights'
import { formatMoney } from '@/lib/money'
import { useAccounts, useReportSavings, useSavingsGoals } from '@/lib/queries'
import { ChartKey, LedgerFigures } from './ledger'

const SeriesBars = lazy(() => import('./charts').then((m) => ({ default: m.SeriesBars })))

/**
 * Savings, kept apart in two kinds: money set aside for goals (an earmark)
 * and money sitting in savings accounts (a balance). Neither is spending.
 */
export function SavingsReport({ range, currency }: { range: DateRange; currency: string }) {
  const goals = useSavingsGoals()
  const { data: accounts = [] } = useAccounts()
  const period = useReportSavings(range.from, range.to)
  const year = twelveMonthsTo(range)
  const trend = useReportSavings(year.from, year.to)
  const list = useMemo(() => goals.data ?? [], [goals.data])
  const saved = list.reduce((n, g) => n + g.saved, 0)
  const added = (period.data ?? []).reduce((n, r) => n + r.added, 0)
  const taken = (period.data ?? []).reduce((n, r) => n + r.taken, 0)
  const savingsAccounts = accounts.filter((a) => a.type === 'savings')
  const inAccounts = savingsAccounts.reduce((n, a) => n + a.current_balance, 0)
  const m = (v: number) => formatMoney(v, currency)
  const now = today()

  if (goals.error) return <ErrorState error={goals.error} onRetry={() => void goals.refetch()} />
  return (
    <div className="flex flex-col gap-6">
      <LedgerFigures
        loading={goals.isPending || period.isPending}
        items={[
          { label: 'Set aside for goals', value: m(saved), hint: 'Today, across every goal' },
          { label: 'Added this period', value: m(added), tone: added > 0 ? 'income' : 'muted' },
          { label: 'Taken out this period', value: m(taken), tone: taken > 0 ? undefined : 'muted' },
          { label: 'In savings accounts', value: m(inAccounts), hint: 'Real balances, today' },
        ]}
      />
      {!goals.isPending && list.length === 0 ? (
        <Panel>
          <EmptyState
            title="No savings goals"
            description="Create a goal on the Savings page to see its progress here."
            className="py-8"
          />
        </Panel>
      ) : (
        <Panel eyebrow="Today" title="Goal progress" flush>
          <Rows>
            {list.map((g) => {
              const pace = goalPace(g, now)
              return (
                <Row
                  key={g.id}
                  to="/savings"
                  title={g.name}
                  subtitle={
                    <span className="flex flex-col gap-1.5">
                      <span>
                        {m(g.saved)} of {m(g.target_amount)}
                        {g.reached
                          ? ' · reached'
                          : pace
                            ? pace.late
                              ? ` · its date (${formatShortDate(g.target_date!)}) has passed`
                              : ` · ${m(pace.perMonth)} a month to make ${formatShortDate(g.target_date!)}`
                            : ''}
                      </span>
                      <Meter value={g.pct} tone={g.reached ? 'income' : 'saffron'} />
                    </span>
                  }
                  trailing={<span className="figure text-lg">{Math.round(g.pct)}%</span>}
                />
              )
            })}
          </Rows>
        </Panel>
      )}
      <Panel
        eyebrow="Last twelve months"
        title="Set aside and taken out"
        description="Goal contributions and withdrawals. They earmark money; they never count as spending."
        action={
          <ChartKey
            items={[
              { label: 'Added', color: 'var(--paid)' },
              { label: 'Taken out', color: 'var(--muted-foreground)' },
            ]}
          />
        }
      >
        {trend.isPending ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <Suspense fallback={<Skeleton className="h-56 w-full" />}>
            <SeriesBars
              rows={trend.data ?? []}
              series={[
                { key: 'added', label: 'Added', color: 'var(--paid)' },
                { key: 'taken', label: 'Taken out', color: 'var(--muted-foreground)' },
              ]}
              currency={currency}
              height={220}
            />
          </Suspense>
        )}
      </Panel>
      {savingsAccounts.length > 0 && (
        <Panel title="Savings accounts" description="The money itself. Goals only earmark part of it." flush>
          <Rows>
            {savingsAccounts.map((a) => (
              <Row
                key={a.id}
                to={`/accounts/${a.id}`}
                title={a.name}
                trailing={<Money minor={a.current_balance} currency={a.currency} className="font-medium" />}
                chevron
              />
            ))}
          </Rows>
        </Panel>
      )}
    </div>
  )
}
