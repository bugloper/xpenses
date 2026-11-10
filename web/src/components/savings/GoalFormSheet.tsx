import { useState } from 'react'
import { toast } from 'sonner'
import { DateField } from '@/components/common/DateField'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { AmountInput } from '@/components/transactions/AmountInput'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorMessage, isApiError } from '@/lib/api'
import { minorToDecimalString, parseAmount } from '@/lib/money'
import { useAccounts, useSaveGoal } from '@/lib/queries'
import type { SavingsGoal, SavingsGoalDetail } from '@/types/api'

const NONE = '__none'
type Errors = Partial<Record<'name' | 'target_amount' | 'target_date' | 'account_id', string>>

/** Create or edit a savings goal: what for, how much, by when, and where the money is kept. */
export function GoalFormSheet({
  open,
  onOpenChange,
  goal,
  currency,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  goal: SavingsGoal | null
  currency: string
  onSaved?: (g: SavingsGoalDetail) => void
}) {
  const save = useSaveGoal()
  const { data: accounts = [] } = useAccounts()
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [accountId, setAccountId] = useState(NONE)
  const [errors, setErrors] = useState<Errors>({})
  const [seen, setSeen] = useState<{ open: boolean; goal: SavingsGoal | null } | null>(null)
  if (!seen || seen.open !== open || seen.goal !== goal) {
    setSeen({ open, goal })
    if (open) {
      setName(goal?.name ?? '')
      setTarget(goal ? minorToDecimalString(goal.target_amount) : '')
      setTargetDate(goal?.target_date ?? '')
      // A new goal suggests the first savings account, if there is one.
      setAccountId(
        goal ? (goal.account_id ?? NONE) : (accounts.find((a) => a.type === 'savings')?.id ?? NONE),
      )
      setErrors({})
    }
  }
  const editing = !!goal

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const amount = parseAmount(target)
    const next: Errors = {}
    if (!name.trim()) next.name = 'Name the goal'
    if (amount === null || amount <= 0) next.target_amount = 'Enter the amount to save'
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      const saved = await save.mutateAsync({
        id: goal?.id,
        name: name.trim(),
        target_amount: amount ?? 0,
        ...(targetDate ? { target_date: targetDate } : editing ? { clear_target_date: true } : {}),
        ...(accountId !== NONE ? { account_id: accountId } : editing ? { clear_account: true } : {}),
      })
      toast.success(editing ? 'Goal updated' : 'Goal created')
      onSaved?.(saved)
      onOpenChange(false)
    } catch (err) {
      if (isApiError(err) && err.isValidation) setErrors(err.details as Errors)
      toast.error(errorMessage(err, 'Could not save the goal'))
    }
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit goal' : 'New savings goal'}
      description={editing ? undefined : 'Something to save for. Setting money aside for it is not spending.'}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button form="goal-form" type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : editing ? 'Save goal' : 'Create goal'}
          </Button>
        </div>
      }
    >
      <form id="goal-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" noValidate>
        <Field data-invalid={!!errors.target_amount}>
          <FieldLabel htmlFor="goal-target" className="sr-only">
            Target
          </FieldLabel>
          <AmountInput
            id="goal-target"
            value={target}
            onChange={setTarget}
            currency={currency}
            invalid={!!errors.target_amount}
            autoFocus={!editing}
          />
          <FieldDescription className="text-center">The amount to save.</FieldDescription>
          <FieldError errors={[errors.target_amount ? { message: errors.target_amount } : undefined]} />
        </Field>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="goal-name">Saving for</FieldLabel>
          <Input
            id="goal-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="A new phone, a trip, an emergency fund"
            autoComplete="off"
            aria-invalid={!!errors.name}
          />
          <FieldError errors={[errors.name ? { message: errors.name } : undefined]} />
        </Field>
        <Field data-invalid={!!errors.target_date}>
          <FieldLabel htmlFor="goal-date">By (optional)</FieldLabel>
          <DateField
            id="goal-date"
            value={targetDate}
            onChange={setTargetDate}
            quickChips={false}
            clearable
          />
          <FieldError errors={[errors.target_date ? { message: errors.target_date } : undefined]} />
        </Field>
        <Field data-invalid={!!errors.account_id}>
          <FieldLabel htmlFor="goal-account">Kept in (optional)</FieldLabel>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger id="goal-account" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not in a particular account</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            With an account, adding to the goal can also move the money there from another account.
          </FieldDescription>
          <FieldError errors={[errors.account_id ? { message: errors.account_id } : undefined]} />
        </Field>
      </form>
    </ResponsiveSheet>
  )
}
