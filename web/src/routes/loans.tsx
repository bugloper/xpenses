import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, HandCoins, History, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { KV, Meter, Note, Panel, Row, Rows, Stat, StatGrid } from '@/components/common/kit'
import { Money } from '@/components/common/Money'
import { PageHeader, Section } from '@/components/common/PageHeader'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { LoanFormSheet } from '@/components/loans/LoanFormSheet'
import { TransactionList } from '@/components/transactions/TransactionList'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/api'
import { formatShortDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { useDefaultCurrency, useDeleteLoan, useInfiniteTransactions, useLoan, useLoans } from '@/lib/queries'
import { loanTotals } from '@/lib/loans'
import { groupByDay } from '@/lib/transactions'
import { uiStore } from '@/lib/ui-store'
import type { Loan } from '@/types/api'
import { appRoute } from './__root'

function repaidPct(l: Loan) {
  return l.principal > 0 ? (l.repaid / l.principal) * 100 : 0
}

function loanLine(l: Loan) {
  const parts = [
    `${l.direction === 'given' ? 'Lent' : 'Borrowed'} ${formatMoney(l.principal, l.currency)}`,
    l.repaid > 0 ? `repaid ${formatMoney(l.repaid, l.currency)}` : null,
    l.due_date && l.outstanding > 0 ? `due ${formatShortDate(l.due_date)}` : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

function LoanRow({ loan }: { loan: Loan }) {
  const settled = loan.outstanding <= 0
  return (
    <Row
      to={`/loans/${loan.id}`}
      title={loan.counterparty}
      subtitle={loanLine(loan)}
      dimmed={settled}
      chevron
      trailing={
        <>
          {settled ? (
            <span className="eyebrow">Settled</span>
          ) : (
            <Money
              minor={loan.outstanding}
              currency={loan.currency}
              className="text-[0.9375rem] font-medium"
            />
          )}
          {!settled && <Meter value={repaidPct(loan)} className="w-20" tone="income" />}
        </>
      }
    />
  )
}

function LoansPage() {
  const { data: loans = [], isPending, error, refetch } = useLoans()
  const currency = useDefaultCurrency()
  const [recording, setRecording] = useState(false)
  const recent = useInfiniteTransactions({ type: 'loan', sort: 'date', order: 'desc' }, 8)
  const recentRows = useMemo(() => recent.data?.pages[0]?.data ?? [], [recent.data])
  const t = loanTotals(loans)
  const given = loans.filter((l) => l.direction === 'given')
  const received = loans.filter((l) => l.direction === 'received')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={isPending ? 'Ledger' : `Ledger · ${t.openGiven + t.openReceived} open`}
        title="Loans"
        description="Money you lent and money you borrowed. Lending, borrowing and repaying move money in and out of your accounts, but they are not income or spending. Only interest is."
        actions={
          <>
            <Button variant="outline" onClick={() => setRecording(true)}>
              <History data-icon="inline-start" /> Record an old loan
            </Button>
            <Button onClick={() => uiStore.openAdd({ type: 'loan_given' })}>
              <Plus data-icon="inline-start" /> Lend or borrow
            </Button>
          </>
        }
      />

      {isPending ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-28 w-full rounded-lg" />
          <ListSkeleton rows={4} />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : loans.length === 0 ? (
        <div className="bg-card rounded-lg border">
          <EmptyState
            icon={HandCoins}
            title="No loans yet"
            description="Record money you lend or borrow from Record › Loan. A loan you already had before can be recorded with what is owed today."
            action={<Button onClick={() => uiStore.openAdd({ type: 'loan_given' })}>Lend or borrow</Button>}
          />
        </div>
      ) : (
        <>
          <StatGrid>
            <Stat
              label="Owed to you"
              value={formatMoney(t.owedToYou, currency)}
              tone={t.owedToYou > 0 ? 'income' : undefined}
              hint={`${t.openGiven} open · ${formatMoney(t.lent, currency)} lent in all`}
            />
            <Stat
              label="You owe"
              value={formatMoney(t.youOwe, currency)}
              tone={t.youOwe > 0 ? 'expense' : undefined}
              hint={`${t.openReceived} open · ${formatMoney(t.borrowed, currency)} borrowed in all`}
            />
          </StatGrid>

          {given.length > 0 && (
            <Panel title="Owed to you" description="Money you lent." flush>
              <Rows>
                {given.map((l) => (
                  <LoanRow key={l.id} loan={l} />
                ))}
              </Rows>
            </Panel>
          )}
          {received.length > 0 && (
            <Panel title="You owe" description="Money you borrowed." flush>
              <Rows>
                {received.map((l) => (
                  <LoanRow key={l.id} loan={l} />
                ))}
              </Rows>
            </Panel>
          )}

          {recentRows.length > 0 && (
            <Section title="Recent loan activity">
              <TransactionList
                groups={groupByDay(recentRows)}
                loading={false}
                error={null}
                onRetry={() => void recent.refetch()}
                currency={currency}
              />
              <Link
                to="/transactions"
                search={{ type: 'loan' }}
                className="text-muted-foreground mt-2 inline-block text-sm underline underline-offset-4"
              >
                All loan transactions
              </Link>
            </Section>
          )}
        </>
      )}
      <LoanFormSheet open={recording} onOpenChange={setRecording} loan={null} currency={currency} />
    </div>
  )
}

function LoanDetailPage() {
  const { id } = loanDetailRoute.useParams()
  const navigate = useNavigate()
  const loan = useLoan(id)
  const txs = useInfiniteTransactions({ loan_id: id, sort: 'date', order: 'desc' }, 50)
  const rows = useMemo(() => txs.data?.pages.flatMap((p) => p.data) ?? [], [txs.data])
  const groups = useMemo(() => groupByDay(rows), [rows])
  const del = useDeleteLoan()
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)

  if (loan.isPending)
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-56 w-full rounded-lg" />
        <ListSkeleton rows={4} />
      </div>
    )
  if (loan.error || !loan.data)
    return <ErrorState error={loan.error ?? new Error('Not found')} onRetry={() => void loan.refetch()} />
  const l = loan.data
  const given = l.direction === 'given'
  const open = l.outstanding > 0
  const hasTransactions = rows.length > 0 || l.transaction_count > 0

  const remove = () =>
    del.mutate(l.id, {
      onSuccess: () => {
        toast.success('Loan deleted')
        void navigate({ to: '/loans' })
      },
      onError: (e) => toast.error(errorMessage(e, 'Could not delete the loan')),
    })

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground -ml-2.5 hidden w-fit lg:inline-flex"
        asChild
      >
        <Link to="/loans">
          <ArrowLeft data-icon="inline-start" /> Loans
        </Link>
      </Button>

      <header className="bg-card rounded-lg border">
        <div className="p-5 sm:p-6">
          <div className="eyebrow">
            {given ? 'Money you lent' : 'Money you borrowed'} · since {formatShortDate(l.start_date)}
          </div>
          <h1 className="font-display mt-2 text-[2rem] leading-tight font-medium sm:text-[2.5rem]">
            {l.counterparty}
          </h1>
          <div className="mt-5">
            <div className="eyebrow">
              {open ? (given ? 'Still owed to you' : 'You still owe') : 'Settled'}
            </div>
            <div className="figure mt-2 text-[2.75rem] leading-none sm:text-[3.25rem]">
              {formatMoney(Math.max(0, l.outstanding), l.currency)}
            </div>
            <Meter
              value={repaidPct(l)}
              tone="income"
              className="mt-4"
              label={`${Math.round(repaidPct(l))}% repaid`}
            />
          </div>
          <dl className="divide-rule mt-4 divide-y border-t">
            {l.opening_amount > 0 && (
              <KV label="Owed when you started recording">{formatMoney(l.opening_amount, l.currency)}</KV>
            )}
            <KV label={given ? 'Lent' : 'Borrowed'}>{formatMoney(l.principal, l.currency)}</KV>
            <KV label="Repaid">{formatMoney(l.repaid, l.currency)}</KV>
            {l.interest > 0 && (
              <KV label={given ? 'Interest earned' : 'Interest paid'}>
                {formatMoney(l.interest, l.currency)}
              </KV>
            )}
            {l.due_date && <KV label="Due">{formatShortDate(l.due_date)}</KV>}
            {l.outstanding < 0 && <KV label="Overpaid">{formatMoney(-l.outstanding, l.currency)}</KV>}
          </dl>
          {l.notes && <p className="text-muted-foreground mt-3 text-sm whitespace-pre-line">{l.notes}</p>}
        </div>
        <footer className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-b-lg border-t px-4 py-3 sm:px-6">
          {open && (
            <Button
              onClick={() =>
                uiStore.openAdd({ type: given ? 'loan_repayment_received' : 'loan_repayment', loan_id: l.id })
              }
            >
              <HandCoins data-icon="inline-start" /> {given ? 'Record a repayment' : 'Repay'}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => uiStore.openAdd({ type: given ? 'loan_given' : 'loan_received', loan_id: l.id })}
          >
            <Plus data-icon="inline-start" /> {given ? 'Lend more' : 'Borrow more'}
          </Button>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            <Pencil data-icon="inline-start" /> Edit
          </Button>
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive ml-auto"
            onClick={() => setConfirm(true)}
          >
            <Trash2 data-icon="inline-start" /> Delete
          </Button>
        </footer>
      </header>

      {l.interest === 0 && open && (
        <Note>
          Interest goes in the repayment form, apart from the amount repaid: the repayment is not{' '}
          {given ? 'income' : 'spending'}, the interest is.
        </Note>
      )}

      <Section title="History">
        <TransactionList
          groups={groups}
          loading={txs.isPending}
          error={txs.error}
          onRetry={() => void txs.refetch()}
          hasMore={txs.hasNextPage}
          loadingMore={txs.isFetchingNextPage}
          onLoadMore={() => void txs.fetchNextPage()}
          currency={l.currency}
          emptyTitle="Nothing recorded on this loan yet"
          emptyDescription={
            l.opening_amount > 0
              ? 'It was recorded with what was already owed.'
              : 'Record lending or a repayment.'
          }
        />
      </Section>

      <LoanFormSheet open={editing} onOpenChange={setEditing} loan={l} currency={l.currency} />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={
          hasTransactions
            ? `${l.counterparty}'s loan can't be deleted`
            : `Delete the loan with ${l.counterparty}?`
        }
        description={
          hasTransactions
            ? 'It has transactions that moved money in and out of your accounts. Delete them first if they were mistakes.'
            : 'Nothing is recorded on it. It is removed for good.'
        }
        confirmLabel="Delete loan"
        destructive
        hideConfirm={hasTransactions}
        onConfirm={remove}
      />
    </div>
  )
}

export const loansRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/loans',
  component: LoansPage,
})

export const loanDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/loans/$id',
  component: LoanDetailPage,
})
