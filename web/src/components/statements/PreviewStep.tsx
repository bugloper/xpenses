import { AlertTriangle, CheckCircle2, CircleAlert, CircleHelp, Copy, Trash2 } from 'lucide-react'
import { useId, useMemo } from 'react'
import { Money } from '@/components/common/Money'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { formatShortDate } from '@/lib/dates'
import {
  duplicateReasonText,
  maskAccountNumber,
  previewTotals,
  recomputeValidation,
  rowProblems,
  type EditableRow,
} from '@/lib/statements'
import { cn } from '@/lib/utils'
import type { DuplicateStatement, PreviewStatement } from '@/types/api'
import { MinorInput } from './MinorInput'

export type PreviewState = {
  statement: PreviewStatement
  rows: EditableRow[]
  skipDuplicates: boolean
  force: boolean
}

type Props = {
  value: PreviewState
  onChange: (next: PreviewState) => void
  duplicate: DuplicateStatement | null
  parseWarnings: string[]
  textExtraction: 'text' | 'none'
  currency: string
}

export function PreviewStep({ value, onChange, duplicate, parseWarnings, textExtraction, currency }: Props) {
  const id = useId()
  const desktop = useIsDesktop()
  const { statement, rows, skipDuplicates, force } = value
  const validation = useMemo(() => recomputeValidation(statement, rows), [statement, rows])
  const totals = useMemo(() => previewTotals(rows), [rows])
  const willImport = skipDuplicates ? totals.count - totals.duplicates : totals.count
  const problems = useMemo(() => rows.filter((r) => rowProblems(r).length > 0).length, [rows])

  const setStatement = (patch: Partial<PreviewStatement>) =>
    onChange({ ...value, statement: { ...statement, ...patch } })
  const setRow = (key: string, patch: Partial<EditableRow>) =>
    onChange({ ...value, rows: rows.map((r) => (r._key === key ? { ...r, ...patch } : r)) })
  const removeRow = (key: string) => onChange({ ...value, rows: rows.filter((r) => r._key !== key) })

  return (
    <div className="flex flex-col gap-5">
      {duplicate && (
        <Alert className={cn(force ? 'border-border' : 'border-warning/40 bg-warning/5')}>
          <Copy className="text-warning" />
          <AlertTitle>{force ? 'Importing again' : 'Looks already imported'}</AlertTitle>
          <AlertDescription>
            {duplicateReasonText(duplicate.reason)} Matches <strong>{duplicate.file_name}</strong> imported{' '}
            {formatShortDate(duplicate.imported_at.slice(0, 10))}.{' '}
            {duplicate.reason === 'sha256'
              ? 'The server will refuse it unless you import anyway.'
              : 'Rows that already exist are skipped when "skip duplicates" is on.'}
          </AlertDescription>
          <AlertAction>
            <Button
              type="button"
              size="sm"
              variant={force ? 'outline' : 'default'}
              onClick={() => onChange({ ...value, force: !force })}
            >
              {force ? 'Undo' : 'Import anyway'}
            </Button>
          </AlertAction>
        </Alert>
      )}

      <ValidationBanner validation={validation} currency={currency} />

      {(parseWarnings.length > 0 || textExtraction === 'none') && (
        <Alert>
          <AlertTriangle className="text-warning" />
          <AlertTitle>Parser notes</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {textExtraction === 'none' && <li>No text layer was found; rows may be incomplete.</li>}
              {parseWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <section className="bg-muted/40 grid grid-cols-2 gap-3 rounded-2xl p-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor={`${id}-holder`} className="text-xs">
            Account holder
          </FieldLabel>
          <Input
            id={`${id}-holder`}
            value={statement.account_holder}
            maxLength={200}
            onChange={(e) => setStatement({ account_holder: e.target.value })}
            className="h-8 text-sm"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-number`} className="text-xs">
            Account number{' '}
            <span className="text-muted-foreground font-normal">
              ({maskAccountNumber(statement.account_number) || '—'})
            </span>
          </FieldLabel>
          <Input
            id={`${id}-number`}
            value={statement.account_number}
            maxLength={64}
            onChange={(e) => setStatement({ account_number: e.target.value })}
            className="tabular h-8 text-sm"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-currency`} className="text-xs">
            Currency
          </FieldLabel>
          <Input
            id={`${id}-currency`}
            value={statement.currency}
            maxLength={3}
            onChange={(e) => setStatement({ currency: e.target.value.toUpperCase() })}
            className="h-8 text-sm uppercase"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-from`} className="text-xs">
            Period start
          </FieldLabel>
          <Input
            id={`${id}-from`}
            type="date"
            value={statement.period_start}
            onChange={(e) => setStatement({ period_start: e.target.value })}
            className="h-8 text-sm"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-to`} className="text-xs">
            Period end
          </FieldLabel>
          <Input
            id={`${id}-to`}
            type="date"
            value={statement.period_end}
            onChange={(e) => setStatement({ period_end: e.target.value })}
            className="h-8 text-sm"
          />
        </Field>
        <Field>
          <FieldLabel className="text-xs">Extraction</FieldLabel>
          <p className="text-muted-foreground h-8 text-sm leading-8">
            {textExtraction === 'text' ? 'Text layer' : 'None (scanned)'}
          </p>
        </Field>
        <Field>
          <FieldLabel className="text-xs">Opening balance</FieldLabel>
          <MinorInput
            aria-label="Opening balance"
            value={statement.opening_balance}
            nullable
            allowNegative
            onCommit={(v) => setStatement({ opening_balance: v })}
          />
        </Field>
        <Field>
          <FieldLabel className="text-xs">Closing balance</FieldLabel>
          <MinorInput
            aria-label="Closing balance"
            value={statement.closing_balance}
            nullable
            allowNegative
            onCommit={(v) => setStatement({ closing_balance: v })}
          />
        </Field>
        <div className="col-span-2 flex flex-col justify-center gap-0.5 text-xs sm:col-span-1">
          <span className="text-muted-foreground">Totals from rows</span>
          <span>
            <Money minor={-totals.debits} currency={currency} tone="expense" /> ·{' '}
            <Money minor={totals.credits} currency={currency} tone="income" sign="always" />
          </span>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          Transactions <span className="text-muted-foreground font-normal">({totals.count})</span>
        </h3>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={skipDuplicates}
            onCheckedChange={(c) => onChange({ ...value, skipDuplicates: c })}
            aria-label="Skip duplicates"
          />
          Skip duplicates
          {totals.duplicates > 0 && (
            <span className="text-muted-foreground text-xs">({totals.duplicates})</span>
          )}
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          No rows left. Nothing will be imported.
        </p>
      ) : desktop ? (
        <DesktopTable rows={rows} skipDuplicates={skipDuplicates} setRow={setRow} removeRow={removeRow} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <MobileRow
              key={r._key}
              row={r}
              skipDuplicates={skipDuplicates}
              setRow={setRow}
              removeRow={removeRow}
            />
          ))}
        </ul>
      )}

      <footer className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs">
        <span>
          <strong className="text-foreground">{willImport}</strong> to import
        </span>
        {totals.duplicates > 0 && (
          <span>
            <strong className="text-foreground">{totals.duplicates}</strong> duplicate
            {totals.duplicates === 1 ? '' : 's'} {skipDuplicates ? 'skipped' : 'kept'}
          </span>
        )}
        {problems > 0 && (
          <span className="text-expense">
            {problems} row{problems === 1 ? '' : 's'} need fixing
          </span>
        )}
        <span className="ml-auto">
          Debits <Money minor={totals.debits} currency={currency} className="text-foreground" /> · Credits{' '}
          <Money minor={totals.credits} currency={currency} className="text-foreground" />
        </span>
      </footer>
    </div>
  )
}

export function ValidationBanner({
  validation,
  currency,
}: {
  validation: ReturnType<typeof recomputeValidation>
  currency: string
}) {
  const { balance_check, difference, computed_closing, messages } = validation
  const Icon = balance_check === 'ok' ? CheckCircle2 : balance_check === 'mismatch' ? CircleAlert : CircleHelp
  return (
    <Alert
      data-state={balance_check}
      className={cn(
        balance_check === 'ok' && 'border-income/40 bg-income/5',
        balance_check === 'mismatch' && 'border-expense/40 bg-expense/5',
      )}
    >
      <Icon
        className={cn(
          balance_check === 'ok' && 'text-income',
          balance_check === 'mismatch' && 'text-expense',
        )}
      />
      <AlertTitle>
        {balance_check === 'ok' && 'Balances check out'}
        {balance_check === 'mismatch' && (
          <>
            Closing balance differs by <Money minor={difference} currency={currency} sign="always" />
          </>
        )}
        {balance_check === 'unavailable' && 'Balance check unavailable'}
      </AlertTitle>
      <AlertDescription>
        {computed_closing !== null && (
          <span>
            Opening + credits − debits ={' '}
            <Money minor={computed_closing} currency={currency} className="text-foreground" />.
          </span>
        )}
        {messages.length > 0 && (
          <ul className="list-disc pl-4">
            {messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  )
}

type RowProps = {
  row: EditableRow
  skipDuplicates: boolean
  setRow: (key: string, patch: Partial<EditableRow>) => void
  removeRow: (key: string) => void
}

function DuplicateTag() {
  return (
    <span className="bg-muted text-muted-foreground inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[10px] font-medium">
      <Copy className="size-3" /> duplicate – will be skipped
    </span>
  )
}

function RowWarnings({ row }: { row: EditableRow }) {
  const all = [...row.warnings, ...rowProblems(row)]
  if (all.length === 0) return null
  return (
    <ul className="text-warning flex flex-col gap-0.5 text-[11px]">
      {all.map((w, i) => (
        <li key={i} className="flex items-start gap-1">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {w}
        </li>
      ))}
    </ul>
  )
}

function DesktopTable({
  rows,
  skipDuplicates,
  setRow,
  removeRow,
}: Omit<RowProps, 'row'> & { rows: EditableRow[] }) {
  return (
    <div className="ring-foreground/10 overflow-x-auto rounded-xl ring-1">
      <Table className="text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead className="w-36">Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-28">Reference</TableHead>
            <TableHead className="w-32 text-right">Debit</TableHead>
            <TableHead className="w-32 text-right">Credit</TableHead>
            <TableHead className="w-36 text-right">Balance</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const skipped = r.is_duplicate && skipDuplicates
            return (
              <TableRow
                key={r._key}
                data-duplicate={r.is_duplicate || undefined}
                className={cn(skipped && 'opacity-50')}
              >
                <TableCell className="text-muted-foreground tabular">{i + 1}</TableCell>
                <TableCell>
                  <Input
                    type="date"
                    aria-label={`Row ${i + 1} date`}
                    value={r.transaction_date}
                    onChange={(e) => setRow(r._key, { transaction_date: e.target.value })}
                    className="h-8 text-sm"
                  />
                </TableCell>
                <TableCell className="min-w-56">
                  <Input
                    aria-label={`Row ${i + 1} description`}
                    value={r.description}
                    maxLength={500}
                    onChange={(e) => setRow(r._key, { description: e.target.value })}
                    className="h-8 text-sm"
                  />
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {r.is_duplicate && <DuplicateTag />}
                    <RowWarnings row={r} />
                  </div>
                </TableCell>
                <TableCell>
                  <Input
                    aria-label={`Row ${i + 1} reference`}
                    value={r.reference}
                    maxLength={100}
                    onChange={(e) => setRow(r._key, { reference: e.target.value })}
                    className="h-8 text-sm"
                  />
                </TableCell>
                <TableCell>
                  <MinorInput
                    aria-label={`Row ${i + 1} debit`}
                    value={r.debit}
                    onCommit={(v) => setRow(r._key, { debit: v ?? 0 })}
                    className={cn(r.debit > 0 && 'text-expense')}
                  />
                </TableCell>
                <TableCell>
                  <MinorInput
                    aria-label={`Row ${i + 1} credit`}
                    value={r.credit}
                    onCommit={(v) => setRow(r._key, { credit: v ?? 0 })}
                    className={cn(r.credit > 0 && 'text-income')}
                  />
                </TableCell>
                <TableCell>
                  <MinorInput
                    aria-label={`Row ${i + 1} balance`}
                    value={r.balance}
                    nullable
                    allowNegative
                    placeholder="—"
                    onCommit={(v) => setRow(r._key, { balance: v })}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete row ${i + 1}`}
                    onClick={() => removeRow(r._key)}
                  >
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function MobileRow({ row: r, skipDuplicates, setRow, removeRow }: RowProps) {
  const skipped = r.is_duplicate && skipDuplicates
  return (
    <li
      data-duplicate={r.is_duplicate || undefined}
      className={cn(
        'bg-card ring-foreground/10 flex flex-col gap-2 rounded-xl p-3 ring-1',
        skipped && 'opacity-50',
      )}
    >
      <div className="flex items-center gap-2">
        <Input
          type="date"
          aria-label="Date"
          value={r.transaction_date}
          onChange={(e) => setRow(r._key, { transaction_date: e.target.value })}
          className="h-8 flex-1 text-sm"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Delete row"
          onClick={() => removeRow(r._key)}
        >
          <Trash2 className="text-muted-foreground" />
        </Button>
      </div>
      <Input
        aria-label="Description"
        value={r.description}
        maxLength={500}
        onChange={(e) => setRow(r._key, { description: e.target.value })}
        className="h-8 text-sm"
      />
      <Input
        aria-label="Reference"
        placeholder="Reference"
        value={r.reference}
        maxLength={100}
        onChange={(e) => setRow(r._key, { reference: e.target.value })}
        className="h-8 text-sm"
      />
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-[11px]">
          <span className="text-expense">Debit</span>
          <MinorInput
            value={r.debit}
            onCommit={(v) => setRow(r._key, { debit: v ?? 0 })}
            aria-label="Debit"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px]">
          <span className="text-income">Credit</span>
          <MinorInput
            value={r.credit}
            onCommit={(v) => setRow(r._key, { credit: v ?? 0 })}
            aria-label="Credit"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px]">
          <span className="text-muted-foreground">Balance</span>
          <MinorInput
            value={r.balance}
            nullable
            allowNegative
            placeholder="—"
            onCommit={(v) => setRow(r._key, { balance: v })}
            aria-label="Balance"
          />
        </label>
      </div>
      {r.is_duplicate && <DuplicateTag />}
      <RowWarnings row={r} />
    </li>
  )
}
