import { Controller, useWatch, type Control, type FieldErrors } from 'react-hook-form'
import { DateField } from '@/components/common/DateField'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatShortDate } from '@/lib/dates'
import { currencySymbol, formatMoney, parseAmount } from '@/lib/money'
import { useLoans } from '@/lib/queries'
import { NEW_LOAN, loanDirection } from '@/lib/transactions'
import type { LoanTransactionType } from '@/types/api'
import type { TransactionFormValues } from './TransactionForm'

/**
 * The loan part of the transaction form: which loan this lends, borrows or
 * repays. Lending and borrowing may start a new loan (a name and an optional
 * due date); a repayment picks a loan that still has something owed and may
 * carry interest, which is recorded apart from the principal.
 */
export function LoanFields({
  control,
  type,
  errors,
  mode,
  formId,
  currency,
}: {
  control: Control<TransactionFormValues>
  type: LoanTransactionType
  errors: FieldErrors<TransactionFormValues>
  mode: 'create' | 'edit'
  formId: string
  currency: string
}) {
  const { data: loans = [] } = useLoans()
  const loanId = useWatch({ control, name: 'loan_id' })
  const amount = parseAmount(useWatch({ control, name: 'amount' }) ?? '')
  // People already lent to or borrowed from, for the name field.
  const names = [...new Set(loans.map((l) => l.counterparty))].sort()
  const direction = loanDirection(type)
  const repaying = type === 'loan_repayment' || type === 'loan_repayment_received'
  // A loan shows if it runs this way and something is owed on it (or it is
  // the one already chosen, when editing).
  const choices = loans.filter(
    (l) => l.direction === direction && (l.outstanding > 0 || l.id === loanId || !repaying),
  )
  const chosen = loans.find((l) => l.id === loanId)
  const isNew = !repaying && loanId === NEW_LOAN
  const who = direction === 'given' ? 'Lent to' : 'Borrowed from'

  return (
    <>
      <Controller
        control={control}
        name="loan_id"
        render={({ field }) => (
          <Field data-invalid={!!errors.loan_id}>
            <FieldLabel htmlFor={`${formId}-loan`}>{repaying ? 'Loan' : who}</FieldLabel>
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <SelectTrigger id={`${formId}-loan`} className="w-full" aria-invalid={!!errors.loan_id}>
                <SelectValue placeholder={repaying ? 'Which loan' : 'Someone new'} />
              </SelectTrigger>
              <SelectContent>
                {!repaying && mode === 'create' && <SelectItem value={NEW_LOAN}>Someone new</SelectItem>}
                {choices.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.counterparty} ·{' '}
                    {l.outstanding > 0 ? `owes ${formatMoney(l.outstanding, l.currency)}` : 'settled'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {repaying && choices.length === 0 && (
              <FieldDescription>
                {direction === 'given'
                  ? 'Nobody owes you anything. Record money you lent first.'
                  : 'You owe nothing. Record money you borrowed first.'}
              </FieldDescription>
            )}
            {chosen && repaying && (
              <FieldDescription>
                {formatMoney(chosen.outstanding, chosen.currency)} still owed
                {chosen.due_date ? `, due ${formatShortDate(chosen.due_date)}` : ''}.
                {amount && amount > 0 && amount <= chosen.outstanding
                  ? amount === chosen.outstanding
                    ? ' This settles it.'
                    : ` ${formatMoney(chosen.outstanding - amount, chosen.currency)} will be left.`
                  : ''}
              </FieldDescription>
            )}
            {chosen && !repaying && (
              <FieldDescription>
                {direction === 'given'
                  ? `${chosen.counterparty} owes you ${formatMoney(chosen.outstanding, chosen.currency)}`
                  : `You owe ${chosen.counterparty} ${formatMoney(chosen.outstanding, chosen.currency)}`}
                {amount && amount > 0
                  ? `; ${formatMoney(chosen.outstanding + amount, chosen.currency)} after this`
                  : ''}
                .
              </FieldDescription>
            )}
            <FieldError errors={[errors.loan_id]} />
          </Field>
        )}
      />

      {isNew && (
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
          <Controller
            control={control}
            name="counterparty"
            render={({ field }) => (
              <Field data-invalid={!!errors.counterparty}>
                <FieldLabel htmlFor={`${formId}-counterparty`}>
                  {direction === 'given' ? 'Who you lent it to' : 'Who you borrowed from'}
                </FieldLabel>
                <Input
                  id={`${formId}-counterparty`}
                  placeholder="Name"
                  autoComplete="off"
                  list={`${formId}-counterparties`}
                  {...field}
                  value={field.value ?? ''}
                  aria-invalid={!!errors.counterparty}
                />
                <datalist id={`${formId}-counterparties`}>
                  {names.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
                <FieldError errors={[errors.counterparty]} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="due_date"
            render={({ field }) => (
              <Field data-invalid={!!errors.due_date}>
                <FieldLabel htmlFor={`${formId}-due`}>Due back (optional)</FieldLabel>
                <DateField
                  id={`${formId}-due`}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  quickChips={false}
                  clearable
                />
                <FieldError errors={[errors.due_date]} />
              </Field>
            )}
          />
        </div>
      )}

      {repaying && mode === 'create' && (
        <Controller
          control={control}
          name="interest"
          render={({ field }) => (
            <Field data-invalid={!!errors.interest}>
              <FieldLabel htmlFor={`${formId}-interest`}>
                {type === 'loan_repayment' ? 'Interest paid (optional)' : 'Interest received (optional)'}
              </FieldLabel>
              <div className="relative">
                <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm">
                  {currencySymbol(currency)}
                </span>
                <Input
                  id={`${formId}-interest`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  className="pl-10 tabular-nums"
                  value={field.value ?? ''}
                  onChange={(e) => {
                    const next = e.target.value.replace(/,/g, '')
                    if (next === '' || /^\d*(\.\d{0,2})?$/.test(next)) field.onChange(next)
                  }}
                  aria-invalid={!!errors.interest}
                />
              </div>
              <FieldDescription>
                {type === 'loan_repayment'
                  ? 'On top of the amount above. It counts as an expense; the amount repaid does not.'
                  : 'On top of the amount above. It counts as income; the amount repaid does not.'}
              </FieldDescription>
              <FieldError errors={[errors.interest]} />
            </Field>
          )}
        />
      )}
    </>
  )
}
