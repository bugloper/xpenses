import { createRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowLeftRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AccountFormSheet } from '@/components/accounts/AccountForm'
import { DeleteAccountDialog } from '@/components/accounts/DeleteAccountDialog'
import { TransferDialog } from '@/components/accounts/TransferDialog'
import { AccountIcon, accountTypeLabel } from '@/components/common/AccountIcon'
import { Meter, Panel, Row, Rows } from '@/components/common/kit'
import { Section } from '@/components/common/PageHeader'
import { Money } from '@/components/common/Money'
import { ErrorState, ListSkeleton } from '@/components/common/States'
import { TransactionList } from '@/components/transactions/TransactionList'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatShortDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { usePendingTransactions } from '@/lib/offline'
import { useAccount, useInfiniteTransactions, useReportAccounts, useSavingsGoals } from '@/lib/queries'
import { groupByDay } from '@/lib/transactions'
import { uiStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import type { Account } from '@/types/api'
import { appRoute } from './__root'

// The statement covers every cleared transaction the account has ever had.
const ALL_TIME = { from: '1970-01-01', to: '9999-12-31' }

/**
 * The goals whose money is kept in this account: how much of its balance is
 * earmarked, and how much is free. Goals don't hold money of their own.
 */
function Earmarks({ account }: { account: Account }) {
  const { data: goals = [] } = useSavingsGoals()
  const mine = goals.filter((g) => g.account_id === account.id)
  if (mine.length === 0) return null
  const earmarked = mine.reduce((n, g) => n + g.saved, 0)
  const free = account.current_balance - earmarked
  return (
    <Panel
      eyebrow="Savings goals"
      title="Earmarked in this account"
      description="Part of the balance above, set aside for goals. Not extra money."
      flush
      footer={
        <div className="flex items-baseline justify-between gap-3">
          <span className={cn(free < 0 && 'text-expense')}>
            {free < 0 ? 'Goals hold more than the account has' : 'Not earmarked'}
          </span>
          <Money minor={free} currency={account.currency} className="font-medium" />
        </div>
      }
    >
      <Rows>
        {mine.map((g) => (
          <Row
            key={g.id}
            to="/savings"
            title={g.name}
            subtitle={<Meter value={g.pct} tone={g.reached ? 'income' : 'saffron'} className="mt-1.5" />}
            trailing={<Money minor={g.saved} currency={account.currency} className="font-medium" />}
            chevron
          />
        ))}
      </Rows>
    </Panel>
  )
}

function AccountDetailPage() {
  const { id } = accountDetailRoute.useParams()
  const account = useAccount(id)
  const txs = useInfiniteTransactions({ account_id: id, sort: 'date', order: 'desc' }, 50)
  const pending = usePendingTransactions()
  const [edit, setEdit] = useState(false)
  const [transfer, setTransfer] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const navigate = accountDetailRoute.useNavigate()
  const rows = useMemo(() => txs.data?.pages.flatMap((p) => p.data) ?? [], [txs.data])
  const groups = useMemo(
    () =>
      groupByDay(
        rows,
        pending.filter((p) => p.payload.account_id === id || p.payload.transfer_account_id === id),
      ),
    [rows, pending, id],
  )

  if (account.isPending)
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-56 w-full rounded-lg" />
        <ListSkeleton rows={5} />
      </div>
    )
  if (account.error || !account.data)
    return (
      <ErrorState error={account.error ?? new Error('Not found')} onRetry={() => void account.refetch()} />
    )
  const a = account.data

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/accounts"
        className="text-muted-foreground hover:text-foreground eyebrow hidden w-fit items-center gap-1.5 transition-colors lg:inline-flex"
      >
        <ArrowLeft className="size-3.5" /> Accounts
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b pb-5">
        <div className="flex min-w-0 items-center gap-4">
          <AccountIcon type={a.type} className="size-12 [&>svg]:size-6" />
          <div className="min-w-0">
            <div className="eyebrow mb-1.5 flex flex-wrap items-center gap-x-2">
              <span>{accountTypeLabel(a.type)}</span>
              {a.account_number && <span className="normal-case">· {a.account_number}</span>}
              <span>· {a.currency}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="font-display truncate text-[2rem] leading-[1.05] font-medium sm:text-[2.5rem]">
                {a.name}
              </h1>
              {!a.is_active && <Badge variant="outline">Inactive</Badge>}
            </div>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button variant="outline" size="icon" aria-label="Edit account" onClick={() => setEdit(true)}>
            <Pencil />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Delete account"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleting(true)}
          >
            <Trash2 />
          </Button>
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setTransfer(true)}>
            <ArrowLeftRight data-icon="inline-start" /> Transfer
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={() => uiStore.openAdd({ account_id: a.id })}>
            <Plus data-icon="inline-start" /> Add transaction
          </Button>
        </div>
      </header>

      <Statement account={a} />
      <Earmarks account={a} />

      <Section title="Transactions">
        <TransactionList
          groups={groups}
          loading={txs.isPending}
          error={txs.error}
          onRetry={() => void txs.refetch()}
          hasMore={txs.hasNextPage}
          loadingMore={txs.isFetchingNextPage}
          onLoadMore={() => void txs.fetchNextPage()}
          perspectiveAccountId={a.id}
          currency={a.currency}
          emptyTitle="No transactions on this account"
        />
      </Section>
      <AccountFormSheet open={edit} onOpenChange={setEdit} account={a} />
      <TransferDialog open={transfer} onOpenChange={setTransfer} fromAccountId={a.id} />
      <DeleteAccountDialog
        account={a}
        open={deleting}
        onOpenChange={setDeleting}
        onDeleted={() => void navigate({ to: '/accounts' })}
      />
    </div>
  )
}

/**
 * The head of a bank statement: the balance as it stands, and how it got
 * there — opening balance, money in, money out. In and out come from the
 * accounts report, which covers active accounts only.
 */
function Statement({ account: a }: { account: Account }) {
  const report = useReportAccounts(ALL_TIME.from, ALL_TIME.to)
  const r = report.data?.find((x) => x.account_id === a.id)
  // Everything that moved the balance, loans included, so the statement adds up.
  const moneyIn = r ? r.income + r.transfers_in + r.loans_in : null
  const moneyOut = r ? r.expenses + r.transfers_out + r.loans_out : null
  const line = 'flex items-baseline justify-between gap-4 py-2.5 text-sm'
  return (
    <section className="bg-card grid overflow-hidden rounded-lg border" aria-label="Statement">
      <div className="flex flex-col justify-between gap-4 p-5 sm:p-6">
        <div>
          <div className="eyebrow">Balance today</div>
          <div
            className={cn(
              'figure mt-3 text-[2.75rem] leading-none break-words sm:text-[3.5rem]',
              a.current_balance < 0 && 'text-expense',
            )}
          >
            {formatMoney(a.current_balance, a.currency)}
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          Opened {formatShortDate(a.opening_balance_date)}. Cleared transactions only; drafts count once
          confirmed.
        </p>
      </div>
      <div className="border-t px-5 py-3 sm:px-6">
        <div className="eyebrow pb-1">Statement · since the account was opened</div>
        <dl className="divide-rule divide-y">
          <div className={line}>
            <dt className="text-muted-foreground">
              Opening balance <span className="text-xs">· {formatShortDate(a.opening_balance_date)}</span>
            </dt>
            <dd className="font-medium">
              <Money minor={a.opening_balance} currency={a.currency} />
            </dd>
          </div>
          <div className={line}>
            <dt className="text-muted-foreground">
              Money in
              {r && r.transfers_in > 0 && (
                <span className="text-xs"> · incl. {formatMoney(r.transfers_in, a.currency)} transfers</span>
              )}
              {r && r.loans_in > 0 && (
                <span className="text-xs"> · {formatMoney(r.loans_in, a.currency)} loans</span>
              )}
            </dt>
            <dd className="font-medium">
              {moneyIn === null ? (
                <StatementGap loading={report.isPending} />
              ) : (
                <Money minor={moneyIn} currency={a.currency} tone="income" sign="always" />
              )}
            </dd>
          </div>
          <div className={line}>
            <dt className="text-muted-foreground">
              Money out
              {r && r.transfers_out > 0 && (
                <span className="text-xs"> · incl. {formatMoney(r.transfers_out, a.currency)} transfers</span>
              )}
              {r && r.loans_out > 0 && (
                <span className="text-xs"> · {formatMoney(r.loans_out, a.currency)} loans</span>
              )}
            </dt>
            <dd className="font-medium">
              {moneyOut === null ? (
                <StatementGap loading={report.isPending} />
              ) : (
                <Money minor={-moneyOut} currency={a.currency} tone="expense" />
              )}
            </dd>
          </div>
        </dl>
        <dl className={cn(line, 'border-foreground/50 border-t-[3px] border-double font-semibold')}>
          <dt>Balance</dt>
          <dd>
            <Money
              minor={a.current_balance}
              currency={a.currency}
              tone={a.current_balance < 0 ? 'expense' : 'neutral'}
            />
          </dd>
        </dl>
      </div>
    </section>
  )
}

function StatementGap({ loading }: { loading: boolean }) {
  if (loading) return <Skeleton className="h-4 w-20" />
  return <span className="text-muted-foreground font-normal">—</span>
}

export const accountDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts/$id',
  component: AccountDetailPage,
})
