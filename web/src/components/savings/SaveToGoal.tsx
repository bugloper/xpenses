import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { DateField } from '@/components/common/DateField'
import { Meter } from '@/components/common/kit'
import { AmountInput } from '@/components/transactions/AmountInput'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorMessage } from '@/lib/api'
import { today } from '@/lib/dates'
import { formatMoney, parseAmount } from '@/lib/money'
import { useAccounts, useAddGoalEntry, useSavingsGoals } from '@/lib/queries'

const STAY = '__stay'

/**
 * "Toward a goal" in the record sheet: set money aside for a savings goal
 * from the same place every other entry is made. The goal is an earmark;
 * only when the user says where the money comes from does it also move, as a
 * transfer into the goal's account. Never spending.
 */
export function SaveToGoal({ currency, onDone }: { currency: string; onDone?: () => void }) {
  const { data: goals = [], isPending } = useSavingsGoals()
  const { data: accounts = [] } = useAccounts()
  const add = useAddGoalEntry()
  const open = goals.filter((g) => !g.reached)
  const [goalId, setGoalId] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [from, setFrom] = useState(STAY)
  const [errors, setErrors] = useState<{ amount?: string; goal?: string }>({})
  const goal = goals.find((g) => g.id === (goalId || open[0]?.id))
  const sources = accounts.filter((a) => a.id !== goal?.account_id)
  const minor = parseAmount(amount)

  if (!isPending && goals.length === 0)
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
        No savings goals yet.{' '}
        <Link to="/savings" onClick={onDone} className="text-foreground underline underline-offset-4">
          Create one on the Savings page
        </Link>
        , then set money aside for it here.
      </p>
    )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!goal) next.goal = 'Pick a goal'
    if (minor === null || minor <= 0) next.amount = 'Enter an amount above zero'
    setErrors(next)
    if (Object.keys(next).length || !goal || !minor) return
    try {
      await add.mutateAsync({
        goalId: goal.id,
        amount: minor,
        entry_date: date,
        ...(from !== STAY ? { from_account_id: from } : {}),
      })
      toast.success(`${formatMoney(minor, currency)} set aside for ${goal.name}`)
      onDone?.()
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save'))
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" noValidate>
      <Field data-invalid={!!errors.amount}>
        <AmountInput
          value={amount}
          onChange={setAmount}
          currency={currency}
          tone="income"
          invalid={!!errors.amount}
          autoFocus
        />
        <FieldError
          errors={[errors.amount ? { message: errors.amount } : undefined]}
          className="text-center"
        />
      </Field>
      <Field data-invalid={!!errors.goal}>
        <FieldLabel htmlFor="save-goal">Goal</FieldLabel>
        <Select
          value={goal?.id ?? ''}
          onValueChange={(v) => {
            setGoalId(v)
            setFrom(STAY)
          }}
        >
          <SelectTrigger id="save-goal" className="w-full">
            <SelectValue placeholder="Pick a goal" />
          </SelectTrigger>
          <SelectContent>
            {goals.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name} · {Math.round(g.pct)}%
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {goal && (
          <div className="mt-1">
            <Meter value={goal.pct} tone={goal.reached ? 'income' : 'saffron'} />
            <FieldDescription className="mt-1.5">
              {formatMoney(goal.saved, currency)} of {formatMoney(goal.target_amount, currency)}
              {minor && minor > 0 ? `, ${formatMoney(goal.saved + minor, currency)} after this` : ''}
            </FieldDescription>
          </div>
        )}
        <FieldError errors={[errors.goal ? { message: errors.goal } : undefined]} />
      </Field>
      {goal?.account_id ? (
        <Field>
          <FieldLabel htmlFor="save-from">Where the money is</FieldLabel>
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger id="save-from" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={STAY}>Already in {goal.account_name}</SelectItem>
              {sources.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  Move it from {a.name} · {formatMoney(a.current_balance, a.currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            {from === STAY
              ? 'Only the goal changes. No balance moves.'
              : `Also records a transfer to ${goal.account_name}. Not spending.`}
          </FieldDescription>
        </Field>
      ) : (
        goal && (
          <FieldDescription>
            This goal isn't tied to an account, so only the goal changes. Give it an account on the Savings
            page to move money with it.
          </FieldDescription>
        )
      )}
      <Field>
        <FieldLabel htmlFor="save-date">Date</FieldLabel>
        <DateField id="save-date" value={date} onChange={setDate} />
      </Field>
      <div className="bg-card sticky bottom-0 z-10 -mx-4 -mb-4 flex items-center justify-end gap-2 border-t px-4 py-3 lg:-mx-5 lg:px-5">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone} disabled={add.isPending}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={add.isPending} className="min-w-24">
          {add.isPending ? 'Saving…' : 'Set aside'}
        </Button>
      </div>
    </form>
  )
}
