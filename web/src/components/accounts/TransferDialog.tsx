import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { DateField } from '@/components/common/DateField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AmountInput } from '@/components/transactions/AmountInput'
import { useSaveTransaction } from '@/components/transactions/AddTransactionSheet'
import { today } from '@/lib/dates'
import { parseAmount } from '@/lib/money'
import { useAccounts, useDefaultCurrency } from '@/lib/queries'

const schema = z
  .object({
    from: z.string().min(1, 'Select the source account'),
    to: z.string().min(1, 'Select the destination account'),
    amount: z.string().refine((v) => (parseAmount(v) ?? 0) > 0, 'Enter an amount'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().max(500).optional(),
  })
  .refine((v) => v.from !== v.to, { path: ['to'], message: 'Must differ from the source account' })
type Values = z.infer<typeof schema>

export function TransferDialog({
  open,
  onOpenChange,
  fromAccountId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  fromAccountId?: string
}) {
  const { data: accounts = [] } = useAccounts()
  const currency = useDefaultCurrency()
  const { create, submitting } = useSaveTransaction()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { from: fromAccountId ?? '', to: '', amount: '', date: today(), description: '' },
  })
  const { control, handleSubmit, reset, formState, watch } = form
  useEffect(() => {
    if (open) reset({ from: fromAccountId ?? '', to: '', amount: '', date: today(), description: '' })
  }, [open, fromAccountId, reset])
  const from = watch('from')
  const err = formState.errors

  const submit = handleSubmit(async (v) => {
    const fromAcc = accounts.find((a) => a.id === v.from)
    const result = await create({
      type: 'transfer',
      amount: parseAmount(v.amount) ?? 0,
      currency: fromAcc?.currency ?? currency,
      account_id: v.from,
      transfer_account_id: v.to,
      category_id: null,
      description: v.description?.trim() ?? '',
      payee: '',
      transaction_date: v.date,
      notes: '',
      tags: [],
      status: 'cleared',
    })
    if (result !== 'error') onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer between accounts</DialogTitle>
          <DialogDescription>Moves money without counting as income or expense.</DialogDescription>
        </DialogHeader>
        <form id="transfer-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <Field data-invalid={!!err.amount}>
                <AmountInput
                  value={field.value}
                  onChange={field.onChange}
                  currency={currency}
                  invalid={!!err.amount}
                  autoFocus
                />
                <FieldError errors={[err.amount]} className="text-center" />
              </Field>
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <Controller
              control={control}
              name="from"
              render={({ field }) => (
                <Field data-invalid={!!err.from}>
                  <FieldLabel>From</FieldLabel>
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[err.from]} />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="to"
              render={({ field }) => (
                <Field data-invalid={!!err.to}>
                  <FieldLabel>To</FieldLabel>
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Destination" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts
                        .filter((a) => a.id !== from)
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[err.to]} />
                </Field>
              )}
            />
          </div>
          <Controller
            control={control}
            name="date"
            render={({ field }) => (
              <Field>
                <FieldLabel>Date</FieldLabel>
                <DateField value={field.value} onChange={field.onChange} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="transfer-desc">Description (optional)</FieldLabel>
                <Input id="transfer-desc" {...field} value={field.value ?? ''} />
              </Field>
            )}
          />
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="transfer-form" disabled={submitting}>
            {submitting ? 'Saving…' : 'Transfer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
