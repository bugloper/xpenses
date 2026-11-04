import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ACCOUNT_TYPE_META } from '@/components/common/AccountIcon'
import { DateField } from '@/components/common/DateField'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorMessage } from '@/lib/api'
import { today } from '@/lib/dates'
import { minorToDecimalString, parseAmount } from '@/lib/money'
import { useCreateAccount, useDefaultCurrency, useUpdateAccount } from '@/lib/queries'
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
      <form id="account-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
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
              <FieldLabel htmlFor="acc-type">Type</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="acc-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ACCOUNT_TYPE_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <Controller
            control={control}
            name="opening_balance"
            render={({ field }) => (
              <Field data-invalid={!!err.opening_balance}>
                <FieldLabel htmlFor="acc-opening">Opening balance</FieldLabel>
                <Input id="acc-opening" inputMode="decimal" {...field} />
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
                <Input id="acc-currency" maxLength={3} {...field} />
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
        <Controller
          control={control}
          name="account_number"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="acc-number">Account number (optional)</FieldLabel>
              <Input
                id="acc-number"
                placeholder="Optional"
                {...field}
                value={field.value ?? ''}
              />
            </Field>
          )}
        />
      </form>
    </ResponsiveSheet>
  )
}
