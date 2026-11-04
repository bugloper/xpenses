import { createRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowLeftRight, Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AccountFormSheet } from '@/components/accounts/AccountForm'
import { TransferDialog } from '@/components/accounts/TransferDialog'
import { AccountIcon, accountTypeLabel } from '@/components/common/AccountIcon'
import { Money } from '@/components/common/Money'
import { ErrorState, ListSkeleton } from '@/components/common/States'
import { TransactionList } from '@/components/transactions/TransactionList'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatShortDate } from '@/lib/dates'
import { usePendingTransactions } from '@/lib/offline'
import { useAccount, useInfiniteTransactions } from '@/lib/queries'
import { groupByDay } from '@/lib/transactions'
import { uiStore } from '@/lib/ui-store'
import { appRoute } from './__root'

function AccountDetailPage() {
  const { id } = accountDetailRoute.useParams()
  const account = useAccount(id)
  const txs = useInfiniteTransactions({ account_id: id, sort: 'date', order: 'desc' }, 50)
  const pending = usePendingTransactions()
  const [edit, setEdit] = useState(false)
  const [transfer, setTransfer] = useState(false)
  const rows = useMemo(() => txs.data?.pages.flatMap((p) => p.data) ?? [], [txs.data])
  const groups = useMemo(
    () =>
      groupByDay(
        rows,
        pending.filter((p) => p.payload.account_id === id || p.payload.transfer_account_id === id),
      ),
    [rows, pending, id],
  )

  if (account.isPending) return <ListSkeleton rows={5} />
  if (account.error || !account.data)
    return (
      <ErrorState error={account.error ?? new Error('Not found')} onRetry={() => void account.refetch()} />
    )
  const a = account.data

  return (
    <div className="flex flex-col gap-5">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
        <Link to="/accounts">
          <ArrowLeft data-icon="inline-start" /> Accounts
        </Link>
      </Button>
      <div className="bg-card border flex flex-col gap-4 rounded-[1.25rem] p-5">
        <div className="flex items-center gap-3">
          <AccountIcon type={a.type} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{a.name}</h1>
              {!a.is_active && <Badge variant="outline">Inactive</Badge>}
            </div>
            <p className="text-muted-foreground text-xs">
              {accountTypeLabel(a.type)}
              {a.account_number ? ` · ${a.account_number}` : ''} · opened{' '}
              {formatShortDate(a.opening_balance_date)} with{' '}
              <Money minor={a.opening_balance} currency={a.currency} />
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Edit account" onClick={() => setEdit(true)}>
            <Pencil />
          </Button>
        </div>
        <Money
          minor={a.current_balance}
          currency={a.currency}
          tone="auto"
          className="text-3xl font-semibold tracking-tight"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => uiStore.openAdd({ account_id: a.id })}>
            <Plus data-icon="inline-start" /> Add transaction
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTransfer(true)}>
            <ArrowLeftRight data-icon="inline-start" /> Transfer
          </Button>
        </div>
      </div>
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
      <AccountFormSheet open={edit} onOpenChange={setEdit} account={a} />
      <TransferDialog open={transfer} onOpenChange={setTransfer} fromAccountId={a.id} />
    </div>
  )
}

export const accountDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts/$id',
  component: AccountDetailPage,
})
