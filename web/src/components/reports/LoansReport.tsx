import { lazy, Suspense } from 'react'
import { Panel, Row, Rows } from '@/components/common/kit'
import { Money } from '@/components/common/Money'
import { EmptyState, ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import { formatShortDate, today, twelveMonthsTo, type DateRange } from '@/lib/dates'
import { loansDue } from '@/lib/insights'
import { loanTotals } from '@/lib/loans'
import { formatMoney } from '@/lib/money'
import { useLoans, useReportLoans } from '@/lib/queries'
import type { Loan } from '@/types/api'
import { ChartKey, LedgerFigures } from './ledger'

const SeriesBars = lazy(() => import('./charts').then((m) => ({ default: m.SeriesBars })))

const sum = <T,>(rows: T[] | undefined, f: (r: T) => number) => (rows ?? []).reduce((n, r) => n + f(r), 0)

function LoanLine({ loan, note }: { loan: Loan; note: string }) {
  return (
    <Row
      to={`/loans/${loan.id}`}
      title={loan.counterparty}
      subtitle={`${loan.direction === 'given' ? 'Owes you' : 'You owe'} · ${note}`}
      trailing={<Money minor={loan.outstanding} currency={loan.currency} className="font-medium" />}
      chevron
    />
  )
}

/**
 * Loans: what is owed each way today, what moved in the period, and what is
 * due. Principal is never income or spending; interest, which is, is shown
 * beside it.
 */
export function LoansReport({ range, currency }: { range: DateRange; currency: string }) {
  const loans = useLoans()
  const period = useReportLoans(range.from, range.to)
  const year = twelveMonthsTo(range)
  const trend = useReportLoans(year.from, year.to)
  const list = loans.data ?? []
  const t = loanTotals(list)
  const { overdue, soon } = loansDue(list, today())
  const settled = list.filter((l) => l.status === 'settled')
  const m = (v: number) => formatMoney(v, currency)
  const repaidToYou = sum(period.data, (r) => r.repaid_to_you)
  const youRepaid = sum(period.data, (r) => r.you_repaid)
  const earned = sum(period.data, (r) => r.interest_earned)
  const paid = sum(period.data, (r) => r.interest_paid)

  if (loans.error) return <ErrorState error={loans.error} onRetry={() => void loans.refetch()} />
  if (!loans.isPending && list.length === 0)
    return (
      <Panel>
        <EmptyState
          title="No loans"
          description="Money you lend or borrow, recorded from Record › Loan, shows here."
          className="py-8"
        />
      </Panel>
    )
  return (
    <div className="flex flex-col gap-6">
      <LedgerFigures
        loading={loans.isPending || period.isPending}
        items={[
          { label: 'Owed to you', value: m(t.owedToYou), hint: `${t.openGiven} open, today` },
          {
            label: 'You owe',
            value: m(t.youOwe),
            tone: t.youOwe > 0 ? 'expense' : 'muted',
            hint: `${t.openReceived} open, today`,
          },
          {
            label: 'Repaid to you',
            value: m(repaidToYou),
            hint: earned > 0 ? `plus ${m(earned)} interest earned` : 'This period',
          },
          {
            label: 'You repaid',
            value: m(youRepaid),
            hint: paid > 0 ? `plus ${m(paid)} interest paid` : 'This period',
          },
        ]}
      />
      {(overdue.length > 0 || soon.length > 0) && (
        <Panel eyebrow="Coming up" title="Due dates" flush>
          <Rows>
            {overdue.map((l) => (
              <LoanLine key={l.id} loan={l} note={`was due ${formatShortDate(l.due_date!)}`} />
            ))}
            {soon.map((l) => (
              <LoanLine key={l.id} loan={l} note={`due ${formatShortDate(l.due_date!)}`} />
            ))}
          </Rows>
        </Panel>
      )}
      <Panel
        eyebrow="Last twelve months"
        title="Money lent, borrowed and repaid"
        description="Principal only. It moves money between your accounts and others; it is never income or spending."
        action={
          <ChartKey
            items={[
              { label: 'Lent', color: 'var(--series-2)' },
              { label: 'Repaid to you', color: 'var(--paid)' },
              { label: 'Borrowed', color: 'var(--series-4)' },
              { label: 'You repaid', color: 'var(--owed)' },
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
                { key: 'lent', label: 'Lent', color: 'var(--series-2)' },
                { key: 'repaid_to_you', label: 'Repaid to you', color: 'var(--paid)' },
                { key: 'borrowed', label: 'Borrowed', color: 'var(--series-4)' },
                { key: 'you_repaid', label: 'You repaid', color: 'var(--owed)' },
              ]}
              currency={currency}
              height={220}
            />
          </Suspense>
        )}
      </Panel>
      {settled.length > 0 && (
        <Panel title="Settled" description="Paid off in full." flush>
          <Rows>
            {settled.map((l) => (
              <Row
                key={l.id}
                to={`/loans/${l.id}`}
                title={l.counterparty}
                subtitle={`${l.direction === 'given' ? 'Lent' : 'Borrowed'} ${formatMoney(l.principal, l.currency)} · last payment ${formatShortDate(l.last_activity)}`}
                trailing={
                  l.interest > 0 ? (
                    <span className="text-muted-foreground text-xs">
                      {formatMoney(l.interest, l.currency)} interest
                    </span>
                  ) : undefined
                }
                chevron
              />
            ))}
          </Rows>
        </Panel>
      )}
    </div>
  )
}
