import { createRoute, Link } from '@tanstack/react-router'
import { ArrowLeftRight, ChevronDown, Eye, EyeOff, MoreVertical, Pencil, Plus, Wallet } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { AccountFormSheet } from '@/components/accounts/AccountForm'
import { TransferDialog } from '@/components/accounts/TransferDialog'
import { AccountIcon, accountTypeLabel } from '@/components/common/AccountIcon'
import { Money } from '@/components/common/Money'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { useAccounts, useDefaultCurrency, useUpdateAccount } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { Account } from '@/types/api'
import { appRoute } from './__root'

/** The composition bar's colours, in order; the rest share the "other" tone. */
const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)']
const seriesFor = (i: number) => SERIES[i] ?? 'var(--series-other)'

/** Ledger columns on wide screens: account, type, number, balance, share, actions. */
const COLS =
  'md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_2.5rem]'

function percent(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0
}

function AccountsPage() {
  // Inactive accounts are always fetched so the folded list can say how many there are.
  const { data, isPending, error, refetch } = useAccounts(true)
  const update = useUpdateAccount()
  const currency = useDefaultCurrency()
  const [editing, setEditing] = useState<Account | null | undefined>(undefined)
  const [transferFrom, setTransferFrom] = useState<string | null | undefined>(undefined)
  const [showInactive, setShowInactive] = useState(false)

  const all = useMemo(() => data ?? [], [data])
  const active = useMemo(
    () => all.filter((a) => a.is_active).sort((a, b) => b.current_balance - a.current_balance),
    [all],
  )
  const inactive = useMemo(() => all.filter((a) => !a.is_active), [all])
  const total = useMemo(() => active.reduce((n, a) => n + a.current_balance, 0), [active])
  const assets = useMemo(() => active.reduce((n, a) => n + Math.max(0, a.current_balance), 0), [active])
  const owed = useMemo(() => active.reduce((n, a) => n + Math.min(0, a.current_balance), 0), [active])
  // Colours follow the composition order, so a row's swatch matches its slice of the bar.
  const colour = useMemo(() => {
    const m = new Map<string, string>()
    active.filter((a) => a.current_balance > 0).forEach((a, i) => m.set(a.id, seriesFor(i)))
    return m
  }, [active])

  const toggleActive = (a: Account) =>
    update.mutate(
      { id: a.id, is_active: !a.is_active },
      {
        onSuccess: () => toast.success(a.is_active ? 'Account deactivated' : 'Account activated'),
        onError: (e) => toast.error(errorMessage(e)),
      },
    )

  const canTransfer = active.length >= 2
  const row = (a: Account) => (
    <AccountRow
      key={a.id}
      account={a}
      share={a.is_active && a.current_balance > 0 ? percent(a.current_balance, assets) : null}
      swatch={colour.get(a.id)}
      canTransfer={canTransfer}
      onEdit={() => setEditing(a)}
      onTransfer={() => setTransferFrom(a.id)}
      onToggleActive={() => toggleActive(a)}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          isPending ? 'Ledger' : `Ledger · ${active.length} active account${active.length === 1 ? '' : 's'}`
        }
        title="Accounts"
        description="Every place your money sits: banks, cash, wallets and cards."
        actions={
          <>
            <Button variant="outline" onClick={() => setTransferFrom(null)} disabled={!canTransfer}>
              <ArrowLeftRight data-icon="inline-start" /> Transfer
            </Button>
            <Button onClick={() => setEditing(null)}>
              <Plus data-icon="inline-start" /> New account
            </Button>
          </>
        }
      />

      {isPending ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-44 w-full rounded-lg" />
          <ListSkeleton rows={4} />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : all.length === 0 ? (
        <div className="bg-card rounded-lg border">
          <EmptyState
            icon={Wallet}
            title="No accounts yet"
            description="Add your bank, cash and wallet accounts to start tracking."
            action={<Button onClick={() => setEditing(null)}>Create account</Button>}
          />
        </div>
      ) : (
        <>
          <NetWorth
            total={total}
            assets={assets}
            owed={owed}
            currency={currency}
            accounts={active}
            colour={colour}
          />

          <section className="bg-card overflow-hidden rounded-lg border" aria-labelledby="accounts-active">
            <header className="flex items-baseline justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
              <h2 id="accounts-active" className="font-display text-[1.1875rem] leading-tight">
                Active accounts
              </h2>
              <span className="eyebrow">Sorted by balance</span>
            </header>
            <div className={cn('eyebrow hidden border-b px-5 py-2.5', COLS)} aria-hidden>
              <span>Account</span>
              <span>Type</span>
              <span>Number</span>
              <span className="text-right">Balance</span>
              <span className="pl-6">Share</span>
              <span />
            </div>
            {active.length === 0 ? (
              <p className="text-muted-foreground px-5 py-8 text-center text-sm">
                Every account is inactive. Activate one below, or add a new one.
              </p>
            ) : (
              <ul className="divide-rule divide-y">{active.map(row)}</ul>
            )}
            <footer className="bg-muted/50 flex items-baseline justify-between gap-3 border-t px-4 py-3 sm:px-5">
              <span className="eyebrow">Net worth</span>
              <Money
                minor={total}
                currency={currency}
                tone={total < 0 ? 'expense' : 'neutral'}
                className="text-sm font-semibold"
              />
            </footer>
          </section>

          {inactive.length > 0 && (
            <section className="bg-card overflow-hidden rounded-lg border">
              <button
                type="button"
                onClick={() => setShowInactive((v) => !v)}
                aria-expanded={showInactive}
                aria-controls="accounts-inactive"
                className="hover:bg-muted/55 flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors sm:px-5"
              >
                <EyeOff className="text-muted-foreground size-4" />
                <span className="flex-1 text-sm font-medium">
                  Inactive accounts{' '}
                  <span className="text-muted-foreground font-normal">({inactive.length})</span>
                </span>
                <span className="text-muted-foreground hidden text-xs sm:inline">
                  Hidden from pickers; kept in history
                </span>
                <ChevronDown
                  className={cn(
                    'text-muted-foreground size-4 transition-transform',
                    showInactive && 'rotate-180',
                  )}
                />
              </button>
              {showInactive && (
                <ul id="accounts-inactive" className="divide-rule divide-y border-t">
                  {inactive.map(row)}
                </ul>
              )}
            </section>
          )}
        </>
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

/** The headline: what everything adds up to, and how it is spread across accounts. */
function NetWorth({
  total,
  assets,
  owed,
  currency,
  accounts,
  colour,
}: {
  total: number
  assets: number
  owed: number
  currency: string
  accounts: Account[]
  colour: Map<string, string>
}) {
  const held = accounts.filter((a) => a.current_balance > 0)
  const debts = accounts.filter((a) => a.current_balance < 0)
  const rest = held.slice(SERIES.length)
  const restTotal = rest.reduce((n, a) => n + a.current_balance, 0)
  return (
    <section
      className="bg-card grid overflow-hidden rounded-lg border lg:grid-cols-12"
      aria-label="Net worth"
    >
      <div className="flex flex-col justify-between gap-5 p-5 sm:p-6 lg:col-span-5 lg:border-r">
        <div>
          <div className="eyebrow">Net worth · active accounts</div>
          <div
            className={cn(
              'figure mt-3 text-[2.75rem] leading-none break-words sm:text-[3.5rem]',
              total < 0 && 'text-expense',
            )}
          >
            {formatMoney(total, currency)}
          </div>
        </div>
        <dl className="divide-rule grid grid-cols-2 divide-x border-t pt-4">
          <div className="pr-4">
            <dt className="eyebrow">Held</dt>
            <dd className="figure mt-1.5 text-xl">{formatMoney(assets, currency)}</dd>
          </div>
          <div className="pl-4">
            <dt className="eyebrow">Owed</dt>
            <dd className={cn('figure mt-1.5 text-xl', owed < 0 && 'text-expense')}>
              {formatMoney(owed, currency)}
            </dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-col gap-4 border-t p-5 sm:p-6 lg:col-span-7 lg:border-t-0">
        <div className="flex items-baseline justify-between gap-3">
          <div className="eyebrow">Where it is held</div>
          <div className="eyebrow">
            {held.length} of {accounts.length} hold money
          </div>
        </div>
        {held.length === 0 ? (
          <p className="text-muted-foreground text-sm">No account holds money right now.</p>
        ) : (
          <>
            <div
              className="bg-bar flex h-3 w-full gap-px overflow-hidden rounded-[2px]"
              role="img"
              aria-label={held
                .map((a) => `${a.name} ${Math.round(percent(a.current_balance, assets))}%`)
                .join(', ')}
            >
              {held.map((a) => (
                <span
                  key={a.id}
                  className="h-full first:rounded-l-[2px] last:rounded-r-[2px]"
                  style={{
                    width: `${percent(a.current_balance, assets)}%`,
                    backgroundColor: colour.get(a.id),
                  }}
                />
              ))}
            </div>
            <ul className="divide-rule grid grid-cols-1 divide-y">
              {held.slice(0, SERIES.length).map((a) => (
                <LegendLine key={a.id} name={a.name} swatch={colour.get(a.id)}>
                  <Money minor={a.current_balance} currency={a.currency} className="text-sm" />
                  <span className="text-muted-foreground w-10 text-right font-mono text-xs tabular-nums">
                    {Math.round(percent(a.current_balance, assets))}%
                  </span>
                </LegendLine>
              ))}
              {rest.length > 0 && (
                <LegendLine
                  name={`${rest.length} more account${rest.length === 1 ? '' : 's'}`}
                  swatch="var(--series-other)"
                >
                  <Money minor={restTotal} currency={currency} className="text-sm" />
                  <span className="text-muted-foreground w-10 text-right font-mono text-xs tabular-nums">
                    {Math.round(percent(restTotal, assets))}%
                  </span>
                </LegendLine>
              )}
              {debts.map((a) => (
                <LegendLine key={a.id} name={a.name} owed>
                  <Money minor={a.current_balance} currency={a.currency} tone="expense" className="text-sm" />
                  <span className="text-muted-foreground w-10 text-right font-mono text-xs">owed</span>
                </LegendLine>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}

function LegendLine({
  name,
  swatch,
  owed,
  children,
}: {
  name: string
  swatch?: string
  owed?: boolean
  children: ReactNode
}) {
  return (
    <li className="flex min-w-0 items-center gap-2.5 py-2 text-sm">
      <span
        aria-hidden
        className={cn('size-2.5 shrink-0 rounded-[2px]', owed && 'border-expense/70 border border-dashed')}
        style={swatch ? { backgroundColor: swatch } : undefined}
      />
      <span className={cn('min-w-0 flex-1 truncate', owed && 'text-muted-foreground')}>{name}</span>
      {children}
    </li>
  )
}

/** One account on the ledger: a stacked row on phones, a table row on wider screens. */
function AccountRow({
  account: a,
  share,
  swatch,
  canTransfer,
  onEdit,
  onTransfer,
  onToggleActive,
}: {
  account: Account
  share: number | null
  swatch?: string
  canTransfer: boolean
  onEdit: () => void
  onTransfer: () => void
  onToggleActive: () => void
}) {
  return (
    <li
      className={cn(
        'hover:bg-muted/55 relative flex items-center gap-3 px-4 py-3 transition-colors sm:px-5',
        COLS,
        'md:items-center md:gap-4',
      )}
    >
      <div className={cn('flex min-w-0 flex-1 items-center gap-3', !a.is_active && 'opacity-60')}>
        <AccountIcon type={a.type} size="sm" />
        <div className="min-w-0">
          <Link
            to="/accounts/$id"
            params={{ id: a.id }}
            className="focus-visible:after:ring-ring/60 block truncate text-sm font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset"
          >
            {a.name}
          </Link>
          <p className="text-muted-foreground truncate text-xs md:hidden">
            {accountTypeLabel(a.type)}
            {a.account_number ? ` · ${a.account_number}` : ''}
          </p>
        </div>
      </div>
      <span
        className={cn('text-muted-foreground hidden truncate text-sm md:block', !a.is_active && 'opacity-60')}
      >
        {accountTypeLabel(a.type)}
      </span>
      <span className="text-muted-foreground hidden truncate font-mono text-xs md:block">
        {a.account_number || '—'}
      </span>
      <div className="flex shrink-0 flex-col items-end gap-1 md:block md:text-right">
        <Money
          minor={a.current_balance}
          currency={a.currency}
          tone={a.current_balance < 0 ? 'expense' : 'neutral'}
          className="text-sm font-semibold"
        />
        {share !== null && (
          <span className="text-muted-foreground font-mono text-[0.6875rem] md:hidden">
            {Math.round(share)}%
          </span>
        )}
      </div>
      <div className="hidden items-center gap-2.5 pl-6 md:flex">
        {share !== null ? (
          <>
            <div className="bg-bar h-1.5 flex-1 overflow-hidden rounded-[2px]">
              <div className="h-full rounded-[2px]" style={{ width: `${share}%`, backgroundColor: swatch }} />
            </div>
            <span className="text-muted-foreground w-9 text-right font-mono text-xs tabular-nums">
              {Math.round(share)}%
            </span>
          </>
        ) : (
          <span className="text-muted-foreground text-xs">{a.is_active ? '—' : 'Inactive'}</span>
        )}
      </div>
      <div className="relative z-10 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${a.name}`}>
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onTransfer} disabled={!canTransfer || !a.is_active}>
              <ArrowLeftRight /> Transfer from
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggleActive}>
              {a.is_active ? <EyeOff /> : <Eye />} {a.is_active ? 'Deactivate' : 'Activate'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

export const accountsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts',
  component: AccountsPage,
})
