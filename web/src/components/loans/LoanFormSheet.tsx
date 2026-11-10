import { useState } from 'react'
import { toast } from 'sonner'
import { DateField } from '@/components/common/DateField'
import { Note } from '@/components/common/kit'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { Segmented } from '@/components/common/Segmented'
import { AmountInput } from '@/components/transactions/AmountInput'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage, isApiError } from '@/lib/api'
import { today } from '@/lib/dates'
import { formatMoney, minorToDecimalString, parseAmount } from '@/lib/money'
import { useCreateLoan, useUpdateLoan } from '@/lib/queries'
import type { Loan, LoanDirection } from '@/types/api'

type Errors = Partial<Record<'counterparty' | 'opening_amount' | 'start_date' | 'due_date' | 'notes', string>>

/**
 * Records a loan that already exists (money lent or borrowed before you
 * started using Xpenses: what is owed today, no money moving now), or edits a
 * loan's details. Lending or borrowing new money is a transaction instead, so
 * it comes out of an account.
 */
export function LoanFormSheet({
  open,
  onOpenChange,
  loan,
  currency,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** The loan to edit; null records an existing one. */
  loan: Loan | null
  currency: string
  onCreated?: (l: Loan) => void
}) {
  const create = useCreateLoan()
  const update = useUpdateLoan()
  const [direction, setDirection] = useState<LoanDirection>('received')
  const [counterparty, setCounterparty] = useState('')
  const [amount, setAmount] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  // Reset the fields each time the sheet opens on a loan (or on a new one).
  const [seen, setSeen] = useState<{ open: boolean; loan: Loan | null } | null>(null)
  if (!seen || seen.open !== open || seen.loan !== loan) {
    setSeen({ open, loan })
    if (open) {
      setDirection(loan?.direction ?? 'received')
      setCounterparty(loan?.counterparty ?? '')
      setAmount(loan && loan.opening_amount > 0 ? minorToDecimalString(loan.opening_amount) : '')
      setStartDate(loan?.start_date ?? today())
      setDueDate(loan?.due_date ?? '')
      setNotes(loan?.notes ?? '')
      setErrors({})
    }
  }
  const editing = !!loan
  const busy = create.isPending || update.isPending

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const opening = amount.trim() === '' ? 0 : parseAmount(amount)
    const next: Errors = {}
    if (!counterparty.trim()) next.counterparty = 'Enter a name'
    if (opening === null || opening < 0) next.opening_amount = 'Enter a valid amount'
    else if (!editing && opening <= 0) next.opening_amount = 'Enter what is owed today'
    if (dueDate && dueDate < startDate) next.due_date = 'Must not be before the loan starts'
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      if (editing) {
        await update.mutateAsync({
          id: loan.id,
          counterparty: counterparty.trim(),
          opening_amount: opening ?? 0,
          start_date: startDate,
          ...(dueDate ? { due_date: dueDate } : { clear_due_date: true }),
          notes,
        })
        toast.success('Loan updated')
      } else {
        const created = await create.mutateAsync({
          direction,
          counterparty: counterparty.trim(),
          opening_amount: opening ?? 0,
          start_date: startDate,
          due_date: dueDate || null,
          notes,
        })
        toast.success('Loan recorded')
        onCreated?.(created)
      }
      onOpenChange(false)
    } catch (err) {
      if (isApiError(err) && err.isValidation) setErrors(err.details as Errors)
      toast.error(errorMessage(err, 'Could not save the loan'))
    }
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit loan · ${loan.counterparty}` : 'Record an existing loan'}
      description={
        editing
          ? undefined
          : 'For money lent or borrowed before you started recording here. No account balance changes.'
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button form="loan-form" type="submit" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save loan' : 'Record loan'}
          </Button>
        </div>
      }
    >
      <form id="loan-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" noValidate>
        {!editing && (
          <Segmented
            aria-label="Who owes whom"
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'received', label: 'I owe them' },
              { value: 'given', label: 'They owe me' },
            ]}
            size="lg"
            className="w-full sm:w-full"
          />
        )}
        <Field data-invalid={!!errors.opening_amount}>
          <FieldLabel htmlFor="loan-opening" className="sr-only">
            Owed
          </FieldLabel>
          <AmountInput
            id="loan-opening"
            value={amount}
            onChange={setAmount}
            currency={loan?.currency ?? currency}
            invalid={!!errors.opening_amount}
            autoFocus={!editing}
          />
          <FieldDescription className="text-center">
            {editing
              ? `Owed when you started recording it. ${formatMoney(loan.principal - loan.opening_amount, loan.currency)} was ${loan.direction === 'given' ? 'lent' : 'borrowed'} here since.`
              : 'What is owed today.'}
          </FieldDescription>
          <FieldError errors={[errors.opening_amount ? { message: errors.opening_amount } : undefined]} />
        </Field>
        <Field data-invalid={!!errors.counterparty}>
          <FieldLabel htmlFor="loan-counterparty">
            {(loan?.direction ?? direction) === 'given' ? 'Who owes you' : 'Who you owe'}
          </FieldLabel>
          <Input
            id="loan-counterparty"
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            placeholder="A person or a bank"
            autoComplete="off"
            aria-invalid={!!errors.counterparty}
          />
          <FieldError errors={[errors.counterparty ? { message: errors.counterparty } : undefined]} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
          <Field data-invalid={!!errors.start_date}>
            <FieldLabel htmlFor="loan-start">Since</FieldLabel>
            <DateField id="loan-start" value={startDate} onChange={setStartDate} quickChips={false} />
            <FieldError errors={[errors.start_date ? { message: errors.start_date } : undefined]} />
          </Field>
          <Field data-invalid={!!errors.due_date}>
            <FieldLabel htmlFor="loan-due">Due (optional)</FieldLabel>
            <DateField id="loan-due" value={dueDate} onChange={setDueDate} quickChips={false} clearable />
            <FieldError errors={[errors.due_date ? { message: errors.due_date } : undefined]} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="loan-notes">Notes</FieldLabel>
          <Textarea
            id="loan-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Terms, what it was for"
          />
        </Field>
        {!editing && (
          <Note>
            Lending or borrowing new money? Use <strong>Record</strong> and choose <strong>Loan</strong>, so
            it comes out of (or goes into) the right account.
          </Note>
        )}
      </form>
    </ResponsiveSheet>
  )
}
