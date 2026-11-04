import { Link } from '@tanstack/react-router'
import { Scale } from 'lucide-react'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { ReconciliationReportView } from '@/components/reconciliation/ReconciliationReportSheet'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { rangeLabel } from '@/lib/dates'
import { useAccounts, useStatements } from '@/lib/queries'

export function ReconciliationTab({
  statementId,
  onStatement,
  currency,
}: {
  statementId: string | undefined
  onStatement: (id: string) => void
  currency: string
}) {
  const statements = useStatements()
  const { data: accounts = [] } = useAccounts(true)
  if (statements.isPending) return <ListSkeleton rows={3} />
  if (statements.error)
    return <ErrorState error={statements.error} onRetry={() => void statements.refetch()} compact />
  const list = statements.data
  if (list.length === 0)
    return (
      <div className="bg-card ring-foreground/10 rounded-2xl ring-1">
        <EmptyState
          icon={Scale}
          title="No statements imported"
          description="Import a bank statement to get a reconciliation report."
          className="py-8"
          action={
            <Button size="sm" asChild>
              <Link to="/statements" search={{ import: '1' }}>
                Import statement
              </Link>
            </Button>
          }
        />
      </div>
    )
  const selected = list.find((s) => s.id === statementId) ?? list[0]!
  const account = accounts.find((a) => a.id === selected.account_id)
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="report-statement">Statement</FieldLabel>
        <Select value={selected.id} onValueChange={onStatement}>
          <SelectTrigger id="report-statement" className="w-full sm:w-96">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {list.map((s) => {
              const acc = accounts.find((a) => a.id === s.account_id)
              return (
                <SelectItem key={s.id} value={s.id}>
                  {s.file_name} · {acc?.name ?? 'Account'} ·{' '}
                  {rangeLabel({ from: s.period_start, to: s.period_end })}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </Field>
      <section className="bg-card ring-foreground/10 rounded-2xl p-4 ring-1">
        <ReconciliationReportView statementId={selected.id} currency={account?.currency ?? currency} />
        <div className="mt-4 border-t pt-3">
          <Button size="sm" variant="outline" asChild>
            <Link to="/reconciliation/$statementId" params={{ statementId: selected.id }}>
              <Scale data-icon="inline-start" /> Open workspace
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
