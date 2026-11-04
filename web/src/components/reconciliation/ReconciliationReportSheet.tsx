import { CheckCircle2, CircleAlert, Download, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Money } from '@/components/common/Money'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { EmptyState, ErrorState } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { downloadFile, errorMessage } from '@/lib/api'
import { formatShortDate, rangeLabel } from '@/lib/dates'
import { useReconciliationReport } from '@/lib/queries'
import { exportFileName, exportPath } from '@/lib/reports'
import { transactionTitle } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import type { ExportFormat } from '@/types/api'

export function ReconciliationExportButtons({
  statementId,
  size = 'sm',
}: {
  statementId: string
  size?: 'sm' | 'xs'
}) {
  const run = async (format: ExportFormat) => {
    try {
      await downloadFile(
        exportPath('reconciliation', format, { statement_id: statementId }),
        exportFileName('reconciliation', format, { statement_id: statementId }),
      )
    } catch (e) {
      toast.error(errorMessage(e, 'Export failed'))
    }
  }
  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" size={size} onClick={() => void run('csv')}>
        <Download data-icon="inline-start" /> CSV
      </Button>
      <Button type="button" variant="outline" size={size} onClick={() => void run('pdf')}>
        <FileText data-icon="inline-start" /> PDF
      </Button>
    </div>
  )
}

function Stat({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="bg-muted/50 flex flex-col rounded-xl px-3 py-2">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <span className={cn('tabular text-sm font-semibold', className)}>{value}</span>
    </div>
  )
}

/** Inline report body; reused by the workspace sheet and the Reports tab. */
export function ReconciliationReportView({
  statementId,
  currency,
}: {
  statementId: string
  currency: string
}) {
  const { data, isPending, error, refetch } = useReconciliationReport(statementId)
  if (isPending) return <Skeleton className="h-64 w-full rounded-xl" />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} compact />
  const r = data
  const b = r.balance
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="font-medium">{r.statement.file_name}</p>
        <p className="text-muted-foreground text-xs">
          {rangeLabel({ from: r.statement.period_start, to: r.statement.period_end })}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat
          label="Statement debits"
          value={<Money minor={-r.total_debits} currency={currency} tone="expense" />}
        />
        <Stat
          label="Statement credits"
          value={<Money minor={r.total_credits} currency={currency} tone="income" sign="always" />}
        />
        <Stat label="Matched" value={r.matched} />
        <Stat
          label="Manual expenses"
          value={<Money minor={-r.manual_expenses} currency={currency} tone="expense" />}
        />
        <Stat
          label="Manual income"
          value={<Money minor={r.manual_income} currency={currency} tone="income" sign="always" />}
        />
        <Stat
          label="Discrepancies"
          value={r.amount_discrepancies.length}
          className={r.amount_discrepancies.length ? 'text-warning' : ''}
        />
      </div>

      <section
        className={cn(
          'rounded-xl border px-3 py-2.5 text-sm',
          b.verified ? 'border-income/40 bg-income/5' : 'border-warning/40 bg-warning/5',
        )}
      >
        <p className="flex items-center gap-1.5 font-medium">
          {b.verified ? (
            <CheckCircle2 className="text-income size-4" />
          ) : (
            <CircleAlert className="text-warning size-4" />
          )}
          {b.verified ? 'Closing balance verified' : 'Closing balance not verified'}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Opening {b.opening === null ? '—' : <Money minor={b.opening} currency={currency} />} · Closing{' '}
          {b.closing === null ? '—' : <Money minor={b.closing} currency={currency} />} · Computed{' '}
          {b.computed_closing === null ? '—' : <Money minor={b.computed_closing} currency={currency} />}
        </p>
      </section>

      <Section title={`Unrecorded bank lines (${r.unrecorded_bank.length})`}>
        {r.unrecorded_bank.length === 0 ? (
          <Empty text="Every bank line is accounted for." />
        ) : (
          <ul className="divide-y text-sm">
            {r.unrecorded_bank.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground">{formatShortDate(t.transaction_date)}</span>{' '}
                  {t.description}
                </span>
                <Money
                  minor={t.debit > 0 ? -t.debit : t.credit}
                  currency={currency}
                  tone="auto"
                  sign="always"
                  className="shrink-0"
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Unmatched manual entries (${r.unmatched_manual.length})`}>
        {r.unmatched_manual.length === 0 ? (
          <Empty text="Every manual entry in the period has a bank line." />
        ) : (
          <ul className="divide-y text-sm">
            {r.unmatched_manual.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground">{formatShortDate(t.transaction_date)}</span>{' '}
                  {transactionTitle(t)}
                </span>
                <Money
                  minor={t.type === 'expense' ? -t.amount : t.amount}
                  currency={t.currency}
                  tone="auto"
                  sign="always"
                  className="shrink-0"
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Amount discrepancies (${r.amount_discrepancies.length})`}>
        {r.amount_discrepancies.length === 0 ? (
          <Empty text="All matched pairs agree on the amount." />
        ) : (
          <ul className="divide-y text-sm">
            {r.amount_discrepancies.map((d) => (
              <li key={d.bank_transaction.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">
                  {d.bank_transaction.description} ↔ {transactionTitle(d.transaction)}
                </span>
                <Money
                  minor={d.difference}
                  currency={currency}
                  sign="always"
                  className="text-warning shrink-0"
                />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-muted-foreground text-xs font-medium">{title}</h3>
      {children}
    </section>
  )
}
function Empty({ text }: { text: string }) {
  return <p className="text-muted-foreground text-xs">{text}</p>
}

export function ReconciliationReportSheet({
  open,
  onOpenChange,
  statementId,
  currency,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  statementId: string
  currency: string
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Reconciliation report"
      description="Snapshot of this statement against your records."
      desktopWidth="sm:max-w-xl"
      footer={<ReconciliationExportButtons statementId={statementId} />}
    >
      {open ? (
        <ReconciliationReportView statementId={statementId} currency={currency} />
      ) : (
        <EmptyState title="" />
      )}
    </ResponsiveSheet>
  )
}
