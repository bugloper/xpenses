import { ArrowLeftRight, Pencil, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { DateField } from '@/components/common/DateField'
import { Meter } from '@/components/common/kit'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { Segmented } from '@/components/common/Segmented'
import { ListSkeleton } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorMessage } from '@/lib/api'
import { formatShortDate, today } from '@/lib/dates'
import { currencySymbol, formatMoney, parseAmount } from '@/lib/money'
import {
  useAccounts,
  useAddGoalEntry,
  useDefaultCurrency,
  useDeleteGoal,
  useDeleteGoalEntry,
  useSavingsGoal,
} from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { SavingsGoal } from '@/types/api'

const STAY = '__stay'

/**
 * One goal: how far along it is, adding to it or taking from it, and its
 * history. Adding moves no money unless the goal names its account and the
 * user picks where the money comes from: then it is an ordinary transfer.
 */
export function GoalSheet({
  goalId,
  onOpenChange,
  onEdit,
}: {
  goalId: string | null
  onOpenChange: (o: boolean) => void
  onEdit: (g: SavingsGoal) => void
}) {
  const goal = useSavingsGoal(goalId ?? '')
  const { data: accounts = [] } = useAccounts()
  const currency = useDefaultCurrency()
  const add = useAddGoalEntry()
  const removeEntry = useDeleteGoalEntry()
  const del = useDeleteGoal()
  const [mode, setMode] = useState<'add' | 'take'>('add')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [move, setMove] = useState(STAY)
  const [error, setError] = useState<string | undefined>()
  const [confirm, setConfirm] = useState(false)
  const g = goal.data
  const otherAccounts = accounts.filter((a) => a.id !== g?.account_id)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!g) return
    const minor = parseAmount(amount)
    if (minor === null || minor <= 0) return setError('Enter an amount above zero')
    if (mode === 'take' && minor > g.saved)
      return setError(`The goal holds ${formatMoney(g.saved, currency)}`)
    setError(undefined)
    try {
      await add.mutateAsync({
        goalId: g.id,
        amount: mode === 'add' ? minor : -minor,
        entry_date: date,
        note: note.trim(),
        ...(move !== STAY ? (mode === 'add' ? { from_account_id: move } : { to_account_id: move }) : {}),
      })
      toast.success(mode === 'add' ? 'Added to the goal' : 'Taken from the goal')
      setAmount('')
      setNote('')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save'))
    }
  }

  return (
    <ResponsiveSheet
      open={!!goalId}
      onOpenChange={onOpenChange}
      title={g?.name ?? 'Savings goal'}
      description={g ? (g.account_name ? `Kept in ${g.account_name}` : 'Not tied to an account') : undefined}
      footer={
        g && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onEdit(g)}>
              <Pencil data-icon="inline-start" /> Edit
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive ml-auto"
              onClick={() => setConfirm(true)}
            >
              <Trash2 data-icon="inline-start" /> Delete goal
            </Button>
          </div>
        )
      }
    >
      {!g ? (
        <ListSkeleton rows={3} />
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <div className="eyebrow">{g.reached ? 'Reached' : `${g.pct}% saved`}</div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
              <span className="figure text-[2.5rem] leading-none">{formatMoney(g.saved, currency)}</span>
              <span className="text-muted-foreground text-sm">
                of {formatMoney(g.target_amount, currency)}
                {g.target_date ? ` by ${formatShortDate(g.target_date)}` : ''}
              </span>
            </div>
            <Meter
              value={g.pct}
              tone={g.reached ? 'income' : 'saffron'}
              className="mt-3"
              label={`${g.pct}% saved`}
            />
          </div>

          <form
            onSubmit={(e) => void submit(e)}
            className="flex flex-col gap-4 rounded-lg border p-4"
            noValidate
          >
            <Segmented
              aria-label="Add or take out"
              value={mode}
              onChange={(m) => {
                setMode(m)
                setMove(STAY)
              }}
              options={[
                { value: 'add', label: 'Add to it' },
                { value: 'take', label: 'Take out' },
              ]}
              className="w-full sm:w-full"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!error}>
                <FieldLabel htmlFor="goal-entry-amount">Amount</FieldLabel>
                <div className="relative">
                  <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm">
                    {currencySymbol(currency)}
                  </span>
                  <Input
                    id="goal-entry-amount"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    className="pl-10 tabular-nums"
                    value={amount}
                    onChange={(e) => {
                      const next = e.target.value.replace(/,/g, currency)
                      if (next === '' || /^\d*(\.\d{0,2})?$/.test(next)) setAmount(next)
                    }}
                    aria-invalid={!!error}
                  />
                </div>
                <FieldError errors={[error ? { message: error } : undefined]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="goal-entry-date">Date</FieldLabel>
                <DateField id="goal-entry-date" value={date} onChange={setDate} quickChips={false} />
              </Field>
            </div>
            {g.account_id && (
              <Field>
                <FieldLabel htmlFor="goal-entry-move">
                  {mode === 'add' ? 'Where the money is' : 'Where the money goes'}
                </FieldLabel>
                <Select value={move} onValueChange={setMove}>
                  <SelectTrigger id="goal-entry-move" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={STAY}>
                      {mode === 'add' ? `Already in ${g.account_name}` : `Stays in ${g.account_name}`}
                    </SelectItem>
                    {otherAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {mode === 'add' ? `Move it from ${a.name}` : `Move it to ${a.name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {move === STAY
                    ? 'Only the goal changes. No account balance moves.'
                    : 'Also records a transfer. Not spending.'}
                </FieldDescription>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="goal-entry-note">Note</FieldLabel>
              <Input id="goal-entry-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Button type="submit" disabled={add.isPending} className="self-end">
              {add.isPending ? 'Saving…' : mode === 'add' ? 'Add to goal' : 'Take out'}
            </Button>
          </form>

          <section>
            <h3 className="eyebrow mb-2">History</h3>
            {g.entries.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing added yet.</p>
            ) : (
              <ul className="divide-rule divide-y border-y">
                {g.entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {e.amount > 0 ? 'Added' : 'Taken out'}
                        {e.transaction_id && (
                          <ArrowLeftRight
                            className="text-muted-foreground size-3.5"
                            aria-label="Moved money"
                          />
                        )}
                      </div>
                      <div className="text-muted-foreground truncate text-xs">
                        {formatShortDate(e.entry_date)}
                        {e.note ? ` · ${e.note}` : ''}
                      </div>
                    </div>
                    <span className={cn('figure text-base', e.amount < 0 && 'text-muted-foreground')}>
                      {e.amount > 0 ? '+' : '−'}
                      {formatMoney(Math.abs(e.amount), currency)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Remove this ${e.amount > 0 ? 'contribution' : 'withdrawal'}`}
                      disabled={removeEntry.isPending}
                      onClick={() =>
                        removeEntry.mutate(
                          { goalId: g.id, entryId: e.id },
                          {
                            onSuccess: () =>
                              toast.success(e.transaction_id ? 'Removed, with its transfer' : 'Removed'),
                            onError: (err) => toast.error(errorMessage(err)),
                          },
                        )
                      }
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${g?.name ?? 'this goal'}?`}
        description="The goal and its history go. Transfers it made stay in your ledger: that money did move."
        confirmLabel="Delete goal"
        destructive
        onConfirm={() =>
          g &&
          del.mutateAsync(g.id).then(
            () => {
              toast.success('Goal deleted')
              onOpenChange(false)
            },
            (err: unknown) => {
              toast.error(errorMessage(err))
            },
          )
        }
      />
    </ResponsiveSheet>
  )
}
