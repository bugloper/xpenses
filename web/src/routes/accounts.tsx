import { createRoute, Link } from '@tanstack/react-router'
import { ArrowLeftRight, Eye, EyeOff, MoreVertical, Pencil, Plus, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AccountFormSheet } from '@/components/accounts/AccountForm'
import { TransferDialog } from '@/components/accounts/TransferDialog'
import { AccountIcon, accountTypeLabel } from '@/components/common/AccountIcon'
import { Money } from '@/components/common/Money'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { errorMessage } from '@/lib/api'
import { useAccounts, useDefaultCurrency, useUpdateAccount } from '@/lib/queries'
import type { Account } from '@/types/api'
import { appRoute } from './__root'

function AccountsPage() {
  const [showInactive, setShowInactive] = useState(false)
  const { data, isPending, error, refetch } = useAccounts(showInactive)
  const update = useUpdateAccount()
  const currency = useDefaultCurrency()
  const [editing, setEditing] = useState<Account | null | undefined>(undefined)
  const [transferFrom, setTransferFrom] = useState<string | null | undefined>(undefined)

  const accounts = useMemo(() => data ?? [], [data])
  const total = useMemo(
    () => accounts.filter((a) => a.is_active).reduce((n, a) => n + a.current_balance, 0),
    [accounts],
  )

  const toggleActive = (a: Account) =>
    update.mutate(
      { id: a.id, is_active: !a.is_active },
      {
        onSuccess: () => toast.success(a.is_active ? 'Account deactivated' : 'Account activated'),
        onError: (e) => toast.error(errorMessage(e)),
      },
    )

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Accounts"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTransferFrom(null)}
              disabled={accounts.length < 2}
            >
              <ArrowLeftRight data-icon="inline-start" /> Transfer
            </Button>
            <Button size="sm" onClick={() => setEditing(null)}>
              <Plus data-icon="inline-start" /> New
            </Button>
          </>
        }
      />
      <div className="bg-card ring-foreground/10 rounded-2xl p-5 ring-1">
        <p className="text-muted-foreground text-sm">Total across active accounts</p>
        <Money
          minor={total}
          currency={currency}
          className="mt-1 block text-3xl font-semibold tracking-tight"
        />
      </div>
      <label className="text-muted-foreground flex items-center justify-end gap-2 text-sm">
        Show inactive
        <Switch checked={showInactive} onCheckedChange={setShowInactive} />
      </label>
      {isPending ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add your bank, cash and wallet accounts to start tracking."
          action={<Button onClick={() => setEditing(null)}>Create account</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="bg-card ring-foreground/10 hover:bg-muted/40 flex items-center gap-3 rounded-2xl p-3 ring-1 transition-colors"
            >
              <Link
                to="/accounts/$id"
                params={{ id: a.id }}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <AccountIcon type={a.type} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{a.name}</p>
                    {!a.is_active && (
                      <Badge variant="outline" className="h-5 text-[10px]">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {accountTypeLabel(a.type)}
                    {a.account_number ? ` · ${a.account_number}` : ''}
                  </p>
                </div>
                <Money
                  minor={a.current_balance}
                  currency={a.currency}
                  tone="auto"
                  className="text-sm font-semibold"
                />
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${a.name}`}>
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(a)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setTransferFrom(a.id)} disabled={accounts.length < 2}>
                    <ArrowLeftRight /> Transfer from
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => toggleActive(a)}>
                    {a.is_active ? <EyeOff /> : <Eye />} {a.is_active ? 'Deactivate' : 'Activate'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
      <AccountFormSheet
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        account={editing ?? null}
      />
      <TransferDialog
        open={transferFrom !== undefined}
        onOpenChange={(o) => !o && setTransferFrom(undefined)}
        fromAccountId={transferFrom ?? undefined}
      />
    </div>
  )
}

export const accountsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts',
  component: AccountsPage,
})
