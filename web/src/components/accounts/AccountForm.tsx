import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ACCOUNT_TYPE_META, AccountIcon } from '@/components/common/AccountIcon'
import { DateField } from '@/components/common/DateField'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/api'
import { today } from '@/lib/dates'
import { minorToDecimalString, parseAmount } from '@/lib/money'
import { useCreateAccount, useDefaultCurrency, useUpdateAccount } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { ACCOUNT_TYPES, type Account } from '@/types/api'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  type: z.enum(['bank', 'cash', 'mobile_wallet', 'credit_card', 'savings']),
  currency: z.string().trim().length(3, '3-letter code').toUpperCase(),
  opening_balance: z.string().refine((v) => parseAmount(v) !== null, 'Enter a valid amount'),
  opening_balance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  account_number: z.string().max(50).optional(),
})
type Values = z.infer<typeof schema>

export function AccountFormSheet({
  open,
  onOpenChange,
  account,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  account?: Account | null
}) {
  const defaultCurrency = useDefaultCurrency()
  const create = useCreateAccount()
  const update = useUpdateAccount()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      type: 'bank',
      currency: defaultCurrency,
      opening_balance: '0.00',
      opening_balance_date: today(),
      account_number: '',
    },
  })
  const { control, handleSubmit, reset, formState } = form
  useEffect(() => {
    if (!open) return
    reset(
      account
        ? {
            name: account.name,
            type: account.type,
            currency: account.currency,
            opening_balance: minorToDecimalString(account.opening_balance),
            opening_balance_date: account.opening_balance_date || today(),
            account_number: account.account_number,
          }
        : {
            name: '',
            type: 'bank',
            currency: defaultCurrency,
            opening_balance: '0.00',
            opening_balance_date: today(),
            account_number: '',
          },
    )
  }, [open, account, reset, defaultCurrency])

  const busy = create.isPending || update.isPending
  const err = formState.errors

  const submit = handleSubmit(async (v) => {
    const body = {
      name: v.name,
      type: v.type,
      currency: v.currency,
      opening_balance: parseAmount(v.opening_balance) ?? 0,
      opening_balance_date: v.opening_balance_date,
      account_number: v.account_number ?? '',
    }
    try {
      if (account) {
        await update.mutateAsync({ id: account.id, ...body })
        toast.success('Account updated')
      } else {
        await create.mutateAsync(body)
        toast.success('Account created')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  })

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={account ? 'Edit account' : 'New account'}
      description={account ? account.name : 'A bank, cash, wallet or card you pay from.'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button form="account-form" type="submit" disabled={busy}>
            {busy ? 'Saving…' : account ? 'Save changes' : 'Create account'}
          </Button>
        </div>
      }
    >
      <form id="account-form" className="flex flex-col gap-6" onSubmit={(e) => void submit(e)} noValidate>
        <div role="group" aria-labelledby="acc-group-account" className="flex flex-col gap-4">
          <p id="acc-group-account" className="eyebrow">
            The account
          </p>
          <Controller
            control={control}
            name="name"
            render={({ field }) => (
              <Field data-invalid={!!err.name}>
                <FieldLabel htmlFor="acc-name">Name</FieldLabel>
                <Input id="acc-name" placeholder="BOB Savings" autoFocus {...field} />
                <FieldError errors={[err.name]} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Field>
                <FieldLabel id="acc-type-label">Type</FieldLabel>
                <div role="radiogroup" aria-labelledby="acc-type-label" className="grid grid-cols-2 gap-2">
                  {ACCOUNT_TYPES.map((t) => {
                    const on = field.value === t
                    return (
                      <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => field.onChange(t)}
                        className={cn(
                          'flex min-h-11 items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-sm transition-colors',
                          on
                            ? 'border-foreground bg-card shadow-[inset_0_0_0_1px_var(--foreground)]'
                            : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted',
                        )}
                      >
                        <AccountIcon type={t} size="sm" className="size-7 [&>svg]:size-3.5" />
                        <span className={cn('min-w-0 truncate', on && 'text-foreground font-medium')}>
                          {ACCOUNT_TYPE_META[t].label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="account_number"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="acc-number">Account number (optional)</FieldLabel>
                <Input
                  id="acc-number"
                  placeholder="Optional"
                  className="font-mono"
                  {...field}
                  value={field.value ?? ''}
                />
              </Field>
            )}
          />
        </div>
        <div role="group" aria-labelledby="acc-group-opening" className="flex flex-col gap-4 border-t pt-5">
          <div>
            <p id="acc-group-opening" className="eyebrow">
              Opening balance
            </p>
            <p className="text-muted-foreground mt-1.5 text-xs">
              What the account held on the day you start tracking it. Transactions are added on top.
            </p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <Controller
              control={control}
              name="opening_balance"
              render={({ field }) => (
                <Field data-invalid={!!err.opening_balance}>
                  <FieldLabel htmlFor="acc-opening">Opening balance</FieldLabel>
                  <Input id="acc-opening" inputMode="decimal" className="tabular text-right" {...field} />
                  <FieldError errors={[err.opening_balance]} />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Field data-invalid={!!err.currency}>
                  <FieldLabel htmlFor="acc-currency">Currency</FieldLabel>
                  <Input id="acc-currency" maxLength={3} className="font-mono uppercase" {...field} />
                  <FieldError errors={[err.currency]} />
                </Field>
              )}
            />
          </div>
          <Controller
            control={control}
            name="opening_balance_date"
            render={({ field }) => (
              <Field data-invalid={!!err.opening_balance_date}>
                <FieldLabel>Opening balance date</FieldLabel>
                <DateField value={field.value} onChange={field.onChange} quickChips={false} />
                <FieldError errors={[err.opening_balance_date]} />
              </Field>
            )}
          />
        </div>
      </form>
    </ResponsiveSheet>
  )
}
