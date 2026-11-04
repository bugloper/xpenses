import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, CheckCircle2, CircleAlert, Download, FileText, Plus, Scale, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { AccountIcon } from '@/components/common/AccountIcon'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Money } from '@/components/common/Money'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { BankStatusBadge } from '@/components/reconciliation/badges'
import { ImportWizard } from '@/components/statements/ImportWizard'
import { ReconciliationProgress, StatementCard } from '@/components/statements/StatementCard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/api'
import { formatShortDate, rangeLabel } from '@/lib/dates'
import {
  statementFileUrl,
  useAccounts,
  useDeleteStatement,
  useStatement,
  useStatements,
  useStatementTransactions,
} from '@/lib/queries'
import { maskAccountNumber } from '@/lib/statements'
import { transactionTitle } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import type { BankTransactionWithStatus } from '@/types/api'
import { appRoute } from './__root'

const listSearch = z.object({ import: z.enum(['1']).optional().catch(undefined) })

function StatementsPage() {
  const search = statementsRoute.useSearch()
  const navigate = statementsRoute.useNavigate()
  const { data, isPending, error, refetch } = useStatements()
  const { data: accounts = [] } = useAccounts(true)
  const [openLocal, setOpenLocal] = useState(false)
  // `/statements?import=1` deep-links straight into the wizard.
  const open = openLocal || search.import === '1'
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const setWizard = (o: boolean) => {
    setOpenLocal(o)
    if (!o && search.import) void navigate({ search: {}, replace: true })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bank Statements"
        description="Import BOB PDF statements and reconcile them against your records."
        actions={
          <Button onClick={() => setWizard(true)} aria-label="Import statement">
            <Plus data-icon="inline-start" /> <span className="hidden sm:inline">Import statement</span>
            <span className="sm:hidden">Import</span>
          </Button>
        }
      />
      {isPending ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <div className="bg-card ring-foreground/10 rounded-2xl ring-1">
          <EmptyState
            icon={FileText}
            title="No statements yet"
            description="In mBOB or BOB internet banking, open your account, choose Statement, pick the period and download the PDF. It is password-protected with the DDMM of your date of birth."
            action={
              <Button onClick={() => setWizard(true)}>
                <Plus data-icon="inline-start" /> Import a statement
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {data.map((s) => (
            <li key={s.id}>
              <StatementCard statement={s} account={byId.get(s.account_id)} />
            </li>
          ))}
        </ul>
      )}
      <ImportWizard open={open} onOpenChange={setWizard} />
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  )
}

function BankLineRow({ line, currency }: { line: BankTransactionWithStatus; currency: string }) {
  const amount = line.debit > 0 ? -line.debit : line.credit
  const linked = line.transaction
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{line.description || '(no description)'}</p>
          <p className="text-muted-foreground truncate text-xs">
            {formatShortDate(line.transaction_date)}
            {line.reference && ` · ${line.reference}`}
            {line.balance !== null && (
              <>
                {' '}
                · bal <Money minor={line.balance} currency={currency} />
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Money
            minor={amount}
            currency={currency}
            tone="auto"
            sign="always"
            className="text-sm font-semibold"
          />
          <BankStatusBadge status={line.status} />
        </div>
      </div>
      {linked && (
        <Link
          to="/transactions/$id"
          params={{ id: linked.id }}
          className="bg-muted/50 hover:bg-muted flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs"
        >
          <span className="truncate">
            ↔ {transactionTitle(linked)}
            {linked.category_name && <span className="text-muted-foreground"> · {linked.category_name}</span>}
          </span>
          <span className="text-muted-foreground shrink-0">
            {formatShortDate(linked.transaction_date)}
            {line.reconciliation && line.reconciliation.amount_diff !== 0 && (
              <>
                {' '}
                · diff <Money minor={line.reconciliation.amount_diff} currency={currency} sign="always" />
              </>
            )}
          </span>
        </Link>
      )}
      {line.status === 'ignored' && line.reconciliation?.note && (
        <p className="text-muted-foreground text-xs italic">Note: {line.reconciliation.note}</p>
      )}
    </li>
  )
}

function StatementDetailPage() {
  const { id } = statementDetailRoute.useParams()
  const navigate = useNavigate()
  const statement = useStatement(id)
  const lines = useStatementTransactions(id)
  const { data: accounts = [] } = useAccounts(true)
  const del = useDeleteStatement()
  const [confirm, setConfirm] = useState(false)

  if (statement.isPending) return <ListSkeleton rows={6} />
  if (statement.error || !statement.data)
    return (
      <ErrorState
        error={statement.error ?? new Error('Not found')}
        onRetry={() => void statement.refetch()}
      />
    )
  const s = statement.data
  const account = accounts.find((a) => a.id === s.account_id)
  const currency = account?.currency ?? 'BTN'

  return (
    <div className="flex flex-col gap-5">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
        <Link to="/statements">
          <ArrowLeft data-icon="inline-start" /> Statements
        </Link>
      </Button>
      <PageHeader
        title={s.file_name}
        description={`${account?.name ?? 'Account'} · ${rangeLabel({ from: s.period_start, to: s.period_end })}`}
        actions={
          <Button asChild>
            <Link to="/reconciliation/$statementId" params={{ statementId: s.id }}>
              <Scale data-icon="inline-start" /> Reconcile
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="bg-card ring-foreground/10 flex flex-col gap-3 rounded-2xl p-4 ring-1">
          <div className="flex items-center gap-3">
            {account && <AccountIcon type={account.type} />}
            <div className="min-w-0">
              <p className="truncate font-medium">{s.account_holder || account?.name || 'Account'}</p>
              <p className="text-muted-foreground tabular text-xs">
                {maskAccountNumber(s.account_number) || '—'}
              </p>
            </div>
            <span
              className={cn(
                'ml-auto flex items-center gap-1 text-xs font-medium',
                s.balance_verified ? 'text-income' : 'text-warning',
              )}
            >
              {s.balance_verified ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <CircleAlert className="size-3.5" />
              )}
              {s.balance_verified ? 'Balance verified' : 'Balance unverified'}
            </span>
          </div>
          <div className="divide-y">
            <MetaRow
              label="Opening balance"
              value={
                s.opening_balance === null ? '—' : <Money minor={s.opening_balance} currency={currency} />
              }
            />
            <MetaRow
              label="Total debits"
              value={<Money minor={-s.total_debits} currency={currency} tone="expense" />}
            />
            <MetaRow
              label="Total credits"
              value={<Money minor={s.total_credits} currency={currency} tone="income" sign="always" />}
            />
            <MetaRow
              label="Closing balance"
              value={
                s.closing_balance === null ? '—' : <Money minor={s.closing_balance} currency={currency} />
              }
            />
            <MetaRow label="Transactions" value={s.transaction_count} />
            <MetaRow label="Imported" value={formatShortDate(s.imported_at.slice(0, 10))} />
            <MetaRow label="Notes" value={s.notes} />
          </div>
          <ReconciliationProgress
            matched={s.matched_count}
            ignored={s.ignored_count}
            unmatched={s.unmatched_count}
          />
          <div className="mt-1 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={statementFileUrl(s.id)} target="_blank" rel="noopener">
                <Download data-icon="inline-start" /> Download original PDF
              </a>
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirm(true)}>
              <Trash2 data-icon="inline-start" /> Delete statement
            </Button>
          </div>
        </section>

        <section className="bg-card ring-foreground/10 rounded-2xl ring-1">
          <h2 className="text-muted-foreground border-b px-3 py-2.5 text-sm font-medium">
            Bank transactions
          </h2>
          {lines.isPending ? (
            <div className="p-3">
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : lines.error ? (
            <ErrorState error={lines.error} onRetry={() => void lines.refetch()} compact />
          ) : lines.data.length === 0 ? (
            <EmptyState title="No bank transactions" className="py-8" />
          ) : (
            <ul className="divide-y">
              {lines.data.map((l) => (
                <BankLineRow key={l.id} line={l} currency={currency} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this statement?"
        description="The statement, its bank transactions and their reconciliations are removed. Your manual transactions are not touched; any that were matched simply become unmatched again."
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={async () => {
          try {
            await del.mutateAsync(s.id)
            toast.success('Statement deleted')
            void navigate({ to: '/statements' })
          } catch (e) {
            toast.error(errorMessage(e, 'Could not delete'))
            throw e
          }
        }}
      />
    </div>
  )
}

export const statementsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/statements',
  validateSearch: listSearch,
  component: StatementsPage,
})
export const statementDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/statements/$id',
  component: StatementDetailPage,
})
