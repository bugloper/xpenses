import { Link } from '@tanstack/react-router'
import { ChevronRight, Wallet } from 'lucide-react'
import { AccountIcon, accountTypeLabel } from '@/components/common/AccountIcon'
import { Panel } from '@/components/common/kit'
import { Money } from '@/components/common/Money'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import type { DateRange } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { useReportAccounts } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { ReportAccount } from '@/types/api'

const TH = 'eyebrow px-3 py-2.5 text-right font-medium first:pl-5 first:text-left last:pr-5'
const TD = 'px-3 py-3 text-right align-middle tabular first:pl-5 first:text-left last:pr-5'

export function AccountsTab({ range }: { range: DateRange }) {
  const q = useReportAccounts(range.from, range.to)
  const desktop = useIsDesktop()
  if (q.isPending)
    return (
      <Panel flush>
        <ListSkeleton rows={4} />
      </Panel>
    )
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
  const rows = q.data
  if (rows.length === 0)
    return (
      <Panel>
        <EmptyState icon={Wallet} title="No accounts yet" className="py-8" />
      </Panel>
    )
  // A total only means something when every account is in the same currency.
  const currency = rows[0]?.currency ?? 'BTN'
  const total = rows.every((a) => a.currency === currency) ? sum(rows) : null
  const title = 'Movement by account'
  const eyebrow = `${rows.length} account${rows.length === 1 ? '' : 's'} · balances as of today`

  if (desktop)
    return (
      <Panel flush eyebrow={eyebrow} title={title}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th scope="col" className={TH}>
                  Account
                </th>
                <th scope="col" className={cn(TH, 'text-left')}>
                  Type
                </th>
                <th scope="col" className={TH}>
                  Opening
                </th>
                <th scope="col" className={TH}>
                  In
                </th>
                <th scope="col" className={TH}>
                  Out
                </th>
                <th scope="col" className={TH}>
                  Transfers
                </th>
                <th scope="col" className={TH}>
                  Balance now
                </th>
              </tr>
            </thead>
            <tbody className="divide-rule divide-y">
              {rows.map((a) => (
                <tr key={a.account_id} className="hover:bg-muted/45 transition-colors">
                  <td className={TD}>
                    <Link
                      to="/accounts/$id"
                      params={{ id: a.account_id }}
                      className="flex items-center gap-3 font-medium underline-offset-4 hover:underline"
                    >
                      <AccountIcon type={a.type} size="sm" />
                      <span className="truncate">{a.name}</span>
                    </Link>
                  </td>
                  <td className={cn(TD, 'text-muted-foreground text-left')}>{accountTypeLabel(a.type)}</td>
                  <td className={cn(TD, 'text-muted-foreground')}>
                    <Money minor={a.opening_balance} currency={a.currency} />
                  </td>
                  <td className={TD}>
                    <Flow minor={a.income} currency={a.currency} tone="income" />
                  </td>
                  <td className={TD}>
                    <Flow minor={-a.expenses} currency={a.currency} tone="expense" />
                  </td>
                  <td className={TD}>
                    <Transfers a={a} />
                  </td>
                  <td className={cn(TD, 'font-semibold')}>
                    <Money minor={a.balance} currency={a.currency} tone="auto" />
                  </td>
                </tr>
              ))}
            </tbody>
            {total && (
              <tfoot>
                <tr className="bg-muted/50 border-foreground/70 border-t-2">
                  <th scope="row" colSpan={2} className={cn(TD, 'eyebrow text-foreground text-left')}>
                    Total
                  </th>
                  <td className={cn(TD, 'text-muted-foreground')}>
                    <Money minor={total.opening_balance} currency={currency} />
                  </td>
                  <td className={TD}>
                    <Flow minor={total.income} currency={currency} tone="income" />
                  </td>
                  <td className={TD}>
                    <Flow minor={-total.expenses} currency={currency} tone="expense" />
                  </td>
                  <td className={TD}>
                    <Money
                      minor={total.transfers_in - total.transfers_out}
                      currency={currency}
                      sign="always"
                    />
                  </td>
                  <td className={cn(TD, 'figure text-base')}>
                    <Money minor={total.balance} currency={currency} tone="auto" />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>
    )

  return (
    <Panel flush eyebrow={eyebrow} title={title}>
      <ul className="divide-rule divide-y">
        {rows.map((a) => (
          <li key={a.account_id}>
            <Link
              to="/accounts/$id"
              params={{ id: a.account_id }}
              className="hover:bg-muted/55 flex flex-col gap-3 px-4 py-3.5 transition-colors"
            >
              <span className="flex items-center gap-3">
                <AccountIcon type={a.type} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.name}</span>
                  <span className="text-muted-foreground block text-xs">{accountTypeLabel(a.type)}</span>
                </span>
                <span className="text-right">
                  <span className="eyebrow block">Balance now</span>
                  <Money
                    minor={a.balance}
                    currency={a.currency}
                    tone="auto"
                    className="text-sm font-semibold"
                  />
                </span>
                <ChevronRight className="text-muted-foreground/50 size-4 shrink-0" />
              </span>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pl-12 text-[0.8125rem] sm:grid-cols-4">
                <Cell label="Opening" value={<Money minor={a.opening_balance} currency={a.currency} />} />
                <Cell label="In" value={<Flow minor={a.income} currency={a.currency} tone="income" />} />
                <Cell label="Out" value={<Flow minor={-a.expenses} currency={a.currency} tone="expense" />} />
                <Cell label="Transfers" value={<Transfers a={a} start />} />
              </dl>
            </Link>
          </li>
        ))}
      </ul>
      {total && (
        <div className="bg-muted/50 border-foreground/70 flex items-baseline justify-between gap-3 border-t-2 px-4 py-3">
          <span className="eyebrow text-foreground">Total balance</span>
          <span className="figure text-lg">{formatMoney(total.balance, currency)}</span>
        </div>
      )}
    </Panel>
  )
}

/** Net transfers, with the two sides underneath when both happened. */
function Transfers({
  a,
  start,
}: {
  a: Pick<ReportAccount, 'transfers_in' | 'transfers_out' | 'currency'>
  start?: boolean
}) {
  const net = a.transfers_in - a.transfers_out
  if (a.transfers_in === 0 && a.transfers_out === 0) return <Nil />
  if (a.transfers_in === 0 || a.transfers_out === 0)
    return <Money minor={net} currency={a.currency} sign="always" />
  return (
    <span className={cn('inline-flex flex-col leading-tight', start ? 'items-start' : 'items-end')}>
      <Money minor={net} currency={a.currency} sign="always" />
      <span className="text-muted-foreground mt-0.5 text-[0.6875rem]">
        in {formatMoney(a.transfers_in, a.currency)} · out {formatMoney(a.transfers_out, a.currency)}
      </span>
    </span>
  )
}

/** A zero in a movement column: a dash, so the eye finds the figures that moved. */
function Nil() {
  return <span className="text-muted-foreground/70">—</span>
}

/** Money in, or money out (passed negative); a dash when nothing moved. */
function Flow({ minor, currency, tone }: { minor: number; currency: string; tone: 'income' | 'expense' }) {
  if (minor === 0) return <Nil />
  return <Money minor={minor} currency={currency} tone={tone} sign={tone === 'income' ? 'always' : 'auto'} />
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="tabular truncate font-medium">{value}</dd>
    </div>
  )
}

function sum(rows: ReportAccount[]) {
  return rows.reduce(
    (t, a) => ({
      opening_balance: t.opening_balance + a.opening_balance,
      income: t.income + a.income,
      expenses: t.expenses + a.expenses,
      transfers_in: t.transfers_in + a.transfers_in,
      transfers_out: t.transfers_out + a.transfers_out,
      balance: t.balance + a.balance,
    }),
    { opening_balance: 0, income: 0, expenses: 0, transfers_in: 0, transfers_out: 0, balance: 0 },
  )
}
