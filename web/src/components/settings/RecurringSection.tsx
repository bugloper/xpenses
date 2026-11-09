import { CategoryField } from '@/components/categories/CategoryField'
import { zodResolver } from '@hookform/resolvers/zod'
import { MoreVertical, Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { DateField } from '@/components/common/DateField'
import { Panel } from '@/components/common/kit'
import { Money } from '@/components/common/Money'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorMessage } from '@/lib/api'
import { formatShortDate, today } from '@/lib/dates'
import { minorToDecimalString, parseAmount, signedAmount } from '@/lib/money'
import {
  useAccounts,
  useCategories,
  useCreateRecurring,
  useDefaultCurrency,
  useDeleteRecurring,
  useRecurring,
  useRunRecurring,
  useUpdateRecurring,
} from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { RecurringTransaction } from '@/types/api'

const schema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    type: z.enum(['expense', 'income', 'transfer']),
    amount: z.string().refine((v) => (parseAmount(v) ?? 0) > 0, 'Enter an amount'),
    account_id: z.string().min(1, 'Select an account'),
    transfer_account_id: z.string().optional(),
    category_id: z.string().optional(),
    payee: z.string().max(200).optional(),
    description: z.string().max(500).optional(),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    interval: z
      .string()
      .regex(/^\d+$/, 'Whole number')
      .refine((v) => Number(v) >= 1 && Number(v) <= 365, 'Between 1 and 365'),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().optional(),
    generate_as: z.enum(['cleared', 'pending']),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'transfer') {
      if (!v.transfer_account_id)
        ctx.addIssue({ code: 'custom', path: ['transfer_account_id'], message: 'Select the destination' })
      else if (v.transfer_account_id === v.account_id)
        ctx.addIssue({
          code: 'custom',
          path: ['transfer_account_id'],
          message: 'Must differ from the source',
        })
    }
  })
type Values = z.infer<typeof schema>

function RecurringFormSheet({
  open,
  onOpenChange,
  item,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  item?: RecurringTransaction | null
}) {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const currency = useDefaultCurrency()
  const create = useCreateRecurring()
  const update = useUpdateRecurring()
  const empty: Values = {
    name: '',
    type: 'expense',
    amount: '',
    account_id: '',
    transfer_account_id: undefined,
    category_id: undefined,
    payee: '',
    description: '',
    frequency: 'monthly',
    interval: '1',
    start_date: today(),
    end_date: '',
    generate_as: 'cleared',
  }
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: empty })
  const { control, handleSubmit, reset, formState, setValue } = form
  useEffect(() => {
    if (!open) return
    reset(
      item
        ? {
            name: item.name,
            type: item.type === 'transfer' ? 'transfer' : item.type === 'income' ? 'income' : 'expense',
            amount: minorToDecimalString(item.amount),
            account_id: item.account_id,
            transfer_account_id: item.transfer_account_id ?? undefined,
            category_id: item.category_id ?? undefined,
            payee: item.payee,
            description: item.description,
            frequency: item.frequency,
            interval: String(item.interval),
            start_date: item.start_date,
            end_date: item.end_date ?? '',
            generate_as: item.generate_as,
          }
        : empty,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item, reset])
  const type = useWatch({ control, name: 'type' })
  const accountId = useWatch({ control, name: 'account_id' })
  const categoryId = useWatch({ control, name: 'category_id' })
  const err = formState.errors
  const busy = create.isPending || update.isPending
  const categoryType = type === 'income' ? 'income' : 'expense'
  // Switching expense <-> income must not keep a category of the other type (server rejects it).
  useEffect(() => {
    if (!categoryId || categories.length === 0) return
    if (!categories.some((c) => c.id === categoryId && c.type === categoryType))
      setValue('category_id', undefined)
  }, [categoryId, categoryType, categories, setValue])

  const submit = handleSubmit(async (v) => {
    const common = {
      name: v.name,
      amount: parseAmount(v.amount) ?? 0,
      currency,
      account_id: v.account_id,
      transfer_account_id: v.type === 'transfer' ? (v.transfer_account_id ?? null) : null,
      category_id: v.type !== 'transfer' && v.category_id ? v.category_id : null,
      description: v.description?.trim() ?? '',
      payee: v.payee?.trim() ?? '',
      frequency: v.frequency,
      interval: Number(v.interval),
      end_date: v.end_date || null,
      generate_as: v.generate_as,
    }
    try {
      if (item) {
        await update.mutateAsync({ id: item.id, ...common })
        toast.success('Recurring updated')
      } else {
        await create.mutateAsync({ ...common, type: v.type, start_date: v.start_date })
        toast.success('Recurring created')
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
      title={item ? 'Edit recurring' : 'New recurring transaction'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button form="recurring-form" type="submit" disabled={busy}>
            {busy ? 'Saving…' : item ? 'Save changes' : 'Create'}
          </Button>
        </div>
      }
    >
      <form id="recurring-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Field data-invalid={!!err.name}>
              <FieldLabel htmlFor="rec-name">Name</FieldLabel>
              <Input id="rec-name" placeholder="Rent, Netflix, Salary…" autoFocus {...field} />
              <FieldError errors={[err.name]} />
            </Field>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Field>
                <FieldLabel>Type</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={!!item}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <Field data-invalid={!!err.amount}>
                <FieldLabel htmlFor="rec-amount">Amount</FieldLabel>
                <Input id="rec-amount" inputMode="decimal" placeholder="0.00" {...field} />
                <FieldError errors={[err.amount]} />
              </Field>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Controller
            control={control}
            name="account_id"
            render={({ field }) => (
              <Field data-invalid={!!err.account_id}>
                <FieldLabel>{type === 'transfer' ? 'From' : 'Account'}</FieldLabel>
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={[err.account_id]} />
              </Field>
            )}
          />
          {type === 'transfer' ? (
            <Controller
              control={control}
              name="transfer_account_id"
              render={({ field }) => (
                <Field data-invalid={!!err.transfer_account_id}>
                  <FieldLabel>To</FieldLabel>
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts
                        .filter((a) => a.id !== accountId)
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[err.transfer_account_id]} />
                </Field>
              )}
            />
          ) : (
            <Controller
              control={control}
              name="category_id"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="recurring-category">Category</FieldLabel>
                  <CategoryField
                    id="recurring-category"
                    categories={categories}
                    type={categoryType}
                    value={field.value}
                    onChange={field.onChange}
                    showRecent={false}
                  />
                </Field>
              )}
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Controller
            control={control}
            name="frequency"
            render={({ field }) => (
              <Field>
                <FieldLabel>Repeats</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="interval"
            render={({ field }) => (
              <Field data-invalid={!!err.interval}>
                <FieldLabel htmlFor="rec-interval">Every</FieldLabel>
                <Input id="rec-interval" type="number" min={1} inputMode="numeric" {...field} />
                <FieldError errors={[err.interval]} />
              </Field>
            )}
          />
        </div>
        <Controller
          control={control}
          name="start_date"
          render={({ field }) => (
            <Field>
              <FieldLabel>{item ? 'Started' : 'Starts'}</FieldLabel>
              <DateField value={field.value} onChange={field.onChange} quickChips={false} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="end_date"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="rec-end">Ends (optional, YYYY-MM-DD)</FieldLabel>
              <Input id="rec-end" placeholder="Never" {...field} value={field.value ?? ''} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="generate_as"
          render={({ field }) => (
            <Field>
              <FieldLabel>Generate as</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cleared">Cleared (counts immediately)</SelectItem>
                  <SelectItem value="pending">Draft (review before it counts)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <Controller
            control={control}
            name="payee"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="rec-payee">Payee</FieldLabel>
                <Input id="rec-payee" {...field} value={field.value ?? ''} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="rec-desc">Description</FieldLabel>
                <Input id="rec-desc" {...field} value={field.value ?? ''} />
              </Field>
            )}
          />
        </div>
      </form>
    </ResponsiveSheet>
  )
}

export function RecurringSection({ id }: { id?: string }) {
  const { data, isPending, error, refetch } = useRecurring()
  const { data: accounts = [] } = useAccounts(true)
  const update = useUpdateRecurring()
  const del = useDeleteRecurring()
  const run = useRunRecurring()
  const [editing, setEditing] = useState<RecurringTransaction | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<RecurringTransaction | null>(null)
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts])
  const list = data ?? []

  return (
    <Panel
      id={id}
      title="Recurring transactions"
      description="Rent, salary, subscriptions. Generated automatically at startup and once a day."
      action={
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={run.isPending}
            onClick={() =>
              run.mutate(undefined, {
                onSuccess: (r) => toast.success(`Generated ${r.generated}, skipped ${r.skipped}`),
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            <Play data-icon="inline-start" /> Run now
          </Button>
          <Button size="sm" onClick={() => setEditing(null)}>
            <Plus data-icon="inline-start" /> New
          </Button>
        </>
      }
      flush
    >
      {isPending ? (
        <ListSkeleton rows={3} className="p-5" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} compact />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No recurring transactions"
          description="Rent, salary, subscriptions…"
          className="py-8"
        />
      ) : (
        <ul className="divide-rule divide-y">
          {list.map((r) => (
            <li key={r.id} className="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-5">
              <span
                aria-hidden
                className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md border"
              >
                <Repeat className="size-4" />
              </span>
              <div className={cn('min-w-0 flex-1', !r.is_active && 'opacity-60')}>
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  {!r.is_active && <Badge variant="outline">Paused</Badge>}
                  {r.generate_as === 'pending' && <Badge variant="secondary">Draft</Badge>}
                </div>
                <p className="text-muted-foreground text-xs">
                  Every {r.interval > 1 ? `${r.interval} ` : ''}
                  {r.frequency === 'daily'
                    ? 'day'
                    : r.frequency === 'weekly'
                      ? 'week'
                      : r.frequency === 'monthly'
                        ? 'month'
                        : 'year'}
                  {r.interval > 1 ? 's' : ''} · {accountName.get(r.account_id) ?? 'account'} · next{' '}
                  {formatShortDate(r.next_run_date)}
                </p>
              </div>
              <Money
                minor={signedAmount(r.type, r.amount)}
                currency={r.currency}
                tone={r.type === 'transfer' ? 'neutral' : 'auto'}
                sign={r.type === 'transfer' ? 'never' : 'always'}
                className="text-sm font-semibold"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.name}`}>
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(r)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      update.mutate(
                        { id: r.id, is_active: !r.is_active },
                        {
                          onSuccess: () => toast.success(r.is_active ? 'Paused' : 'Resumed'),
                          onError: (e) => toast.error(errorMessage(e)),
                        },
                      )
                    }
                  >
                    {r.is_active ? <Pause /> : <Play />} {r.is_active ? 'Pause' : 'Resume'}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(r)}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
      <RecurringFormSheet
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        item={editing ?? null}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="Already generated transactions are kept."
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await del.mutateAsync(deleting.id)
            toast.success('Deleted')
          } catch (e) {
            toast.error(errorMessage(e))
          }
        }}
      />
    </Panel>
  )
}
