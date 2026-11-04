import { Link } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'
import { AccountIcon, accountTypeLabel } from '@/components/common/AccountIcon'
import { Money } from '@/components/common/Money'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import type { DateRange } from '@/lib/dates'
import { useReportAccounts } from '@/lib/queries'

export function AccountsTab({ range }: { range: DateRange }) {
  const q = useReportAccounts(range.from, range.to)
  const desktop = useIsDesktop()
  if (q.isPending) return <ListSkeleton rows={4} />
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
  const rows = q.data
  if (rows.length === 0)
    return (
      <div className="bg-card ring-foreground/10 rounded-2xl ring-1">
        <EmptyState icon={Wallet} title="No accounts yet" className="py-8" />
      </div>
    )
  if (desktop)
    return (
      <div className="bg-card ring-foreground/10 overflow-x-auto rounded-2xl ring-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Opening</TableHead>
              <TableHead className="text-right">Income</TableHead>
              <TableHead className="text-right">Expenses</TableHead>
              <TableHead className="text-right">Transfers in</TableHead>
              <TableHead className="text-right">Transfers out</TableHead>
              <TableHead className="text-right">Balance now</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.account_id}>
                <TableCell>
                  <Link to="/accounts/$id" params={{ id: a.account_id }} className="flex items-center gap-2 hover:underline">
                    <AccountIcon type={a.type} size="sm" />
                    <span>
                      <span className="block font-medium">{a.name}</span>
                      <span className="text-muted-foreground block text-xs">{accountTypeLabel(a.type)}</span>
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-right"><Money minor={a.opening_balance} currency={a.currency} /></TableCell>
                <TableCell className="text-right"><Money minor={a.income} currency={a.currency} tone="income" sign="always" /></TableCell>
                <TableCell className="text-right"><Money minor={-a.expenses} currency={a.currency} tone="expense" /></TableCell>
                <TableCell className="text-right"><Money minor={a.transfers_in} currency={a.currency} sign="always" /></TableCell>
                <TableCell className="text-right"><Money minor={-a.transfers_out} currency={a.currency} /></TableCell>
                <TableCell className="text-right font-semibold"><Money minor={a.balance} currency={a.currency} tone="auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((a) => (
        <li key={a.account_id} className="bg-card ring-foreground/10 flex flex-col gap-2 rounded-2xl p-4 ring-1">
          <Link to="/accounts/$id" params={{ id: a.account_id }} className="flex items-center gap-3">
            <AccountIcon type={a.type} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{a.name}</span>
              <span className="text-muted-foreground block text-xs">{accountTypeLabel(a.type)}</span>
            </span>
            <Money minor={a.balance} currency={a.currency} tone="auto" className="font-semibold" />
          </Link>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <Row label="Opening" value={<Money minor={a.opening_balance} currency={a.currency} />} />
            <Row label="Income" value={<Money minor={a.income} currency={a.currency} tone="income" sign="always" />} />
            <Row label="Expenses" value={<Money minor={-a.expenses} currency={a.currency} tone="expense" />} />
            <Row label="Transfers in" value={<Money minor={a.transfers_in} currency={a.currency} sign="always" />} />
            <Row label="Transfers out" value={<Money minor={-a.transfers_out} currency={a.currency} />} />
          </dl>
        </li>
      ))}
    </ul>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  )
}
