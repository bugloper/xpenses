import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { ChevronUp, MoreHorizontal, Plus } from 'lucide-react'
import { CategoryFormSheet } from '@/components/categories/CategoryForm'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { DateField } from '@/components/common/DateField'
import { Segmented } from '@/components/common/Segmented'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { today } from '@/lib/dates'
import { getLastUsed, setLastUsed } from '@/lib/last-used'
import { minorToDecimalString, parseAmount } from '@/lib/money'
import { useAccounts, useCategories } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { CreateTransactionRequest, Transaction, TransactionType } from '@/types/api'
import { AmountInput } from './AmountInput'

export const transactionSchema = z
  .object({
    type: z.enum(['expense', 'income', 'transfer', 'refund', 'adjustment']),
    amount: z.string(),
    account_id: z.string().min(1, 'Select an account'),
    transfer_account_id: z.string().optional(),
    category_id: z.string().optional(),
    transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
    description: z.string().max(500, 'Too long').optional(),
  })
  .superRefine((v, ctx) => {
    const minor = parseAmount(v.amount)
    if (minor === null) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter a valid amount (up to 2 decimals)' })
    } else if (minor === 0) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Amount must not be zero' })
    } else if (minor < 0 && v.type !== 'adjustment') {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Amount must be positive' })
    }
    if (v.type === 'transfer') {
      if (!v.transfer_account_id) {
        ctx.addIssue({
          code: 'custom',
          path: ['transfer_account_id'],
          message: 'Select the destination account',
        })
      } else if (v.transfer_account_id === v.account_id) {
        ctx.addIssue({
          code: 'custom',
          path: ['transfer_account_id'],
          message: 'Must differ from the source account',
        })
      }
    }
  })

export type TransactionFormValues = z.infer<typeof transactionSchema>

/** Converts validated form values into the API payload. */
export function toCreateRequest(v: TransactionFormValues, currency: string): CreateTransactionRequest {
  const amount = parseAmount(v.amount) ?? 0
  const isTransfer = v.type === 'transfer'
  const hasCategory = v.type === 'expense' || v.type === 'income' || v.type === 'refund'
  return {
    type: v.type,
    amount,
    currency,
    account_id: v.account_id,
    transfer_account_id: isTransfer ? (v.transfer_account_id ?? null) : null,
    category_id: hasCategory && v.category_id ? v.category_id : null,
    description: v.description?.trim() ?? '',
    transaction_date: v.transaction_date,
    status: 'cleared',
  }
}

export function fromTransaction(tx: Transaction): TransactionFormValues {
  return {
    type: tx.type,
    amount: minorToDecimalString(tx.amount),
    account_id: tx.account_id,
    transfer_account_id: tx.transfer_account_id ?? undefined,
    category_id: tx.category_id ?? undefined,
    transaction_date: tx.transaction_date,
    description: tx.description,
  }
}

const ACCOUNT_RANK: Record<string, number> = {
  bank: 0,
  cash: 1,
  mobile_wallet: 2,
  savings: 3,
  credit_card: 4,
}
function rank(type: string) {
  return ACCOUNT_RANK[type] ?? 9
}

export function defaultValues(preset: Partial<TransactionFormValues> = {}): TransactionFormValues {
  // Drop explicit undefined keys so they cannot clobber the computed defaults below.
  const given = Object.fromEntries(
    Object.entries(preset).filter(([, v]) => v !== undefined),
  ) as Partial<TransactionFormValues>
  const type = given.type ?? 'expense'
  const last = getLastUsed(type)
  return {
    type,
    amount: '',
    account_id: given.account_id ?? last.account_id ?? '',
    transfer_account_id: given.transfer_account_id ?? last.transfer_account_id ?? undefined,
    category_id: given.category_id ?? last.category_id ?? undefined,
    transaction_date: today(),
    description: '',
    ...given,
  }
}

type Props = {
  initial: TransactionFormValues
  mode: 'create' | 'edit'
  currency: string
  submitting?: boolean
  onSubmit: (values: TransactionFormValues, opts: { addAnother: boolean }) => Promise<void> | void
  onCancel?: () => void
  /** Server-side field errors (e.g. from a 422). */
  serverErrors?: Record<string, string>
  formId?: string
  allowAddAnother?: boolean
}

const TYPE_OPTIONS: { value: TransactionType; label: string; tone?: 'income' | 'expense' }[] = [
  { value: 'expense', label: 'Expense', tone: 'expense' },
  { value: 'income', label: 'Income', tone: 'income' },
  { value: 'transfer', label: 'Transfer' },
]

export function TransactionForm({
  initial,
  mode,
  currency,
  submitting,
  onSubmit,
  onCancel,
  serverErrors,
  formId = 'transaction-form',
  allowAddAnother = true,
}: Props) {
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: initial,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const { control, handleSubmit, setValue, setError, formState, reset } = form
  const type = useWatch({ control, name: 'type' })
  const accountId = useWatch({ control, name: 'account_id' })
  const categoryId = useWatch({ control, name: 'category_id' })
  const amountRef = useRef<HTMLInputElement>(null)

  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  useEffect(() => {
    reset(initial)
  }, [initial, reset])

  useEffect(() => {
    if (!serverErrors) return
    for (const [field, message] of Object.entries(serverErrors)) {
      setError(field as keyof TransactionFormValues, { type: 'server', message })
    }
  }, [serverErrors, setError])

  // When the type changes in create mode, restore the last-used account/category for that type.
  const lastTypeRef = useRef(type)
  useEffect(() => {
    if (lastTypeRef.current === type) return
    lastTypeRef.current = type
    if (mode !== 'create') return
    const last = getLastUsed(type)
    if (last.account_id) setValue('account_id', last.account_id)
    setValue('category_id', last.category_id ?? undefined)
    if (last.transfer_account_id) setValue('transfer_account_id', last.transfer_account_id)
  }, [type, mode, setValue])

  const categoryType =
    type === 'expense' ? 'expense' : type === 'income' || type === 'refund' ? 'income' : null
  const visibleCategories = useMemo(
    () =>
      categoryType
        ? categories.filter((c) => c.type === categoryType && (c.is_active || c.id === categoryId))
        : [],
    [categories, categoryType, categoryId],
  )
  // Clear a category that doesn't match the new type.
  useEffect(() => {
    if (
      categoryId &&
      categoryType &&
      !categories.some((c) => c.id === categoryId && c.type === categoryType)
    ) {
      if (categories.length > 0) setValue('category_id', undefined)
    }
  }, [categoryId, categoryType, categories, setValue])

  const activeAccounts = accounts.filter((a) => a.is_active || a.id === accountId)

  // Quick entry must not stall on the account picker: when creating and no
  // valid account is chosen, fall back to the remembered one, else the only
  // active account, else the first active one (bank/cash first).
  useEffect(() => {
    if (mode !== 'create' || activeAccounts.length === 0) return
    const valid = (id?: string) => !!id && activeAccounts.some((a) => a.id === id)
    if (valid(accountId)) return
    const last = getLastUsed(type).account_id
    const preferred =
      (valid(last) ? last : undefined) ??
      [...activeAccounts].sort((a, b) => rank(a.type) - rank(b.type))[0]?.id
    if (preferred) setValue('account_id', preferred, { shouldValidate: formState.isSubmitted })
  }, [mode, activeAccounts, accountId, type, setValue, formState.isSubmitted])

  const [showAllCategories, setShowAllCategories] = useState(false)
  const [newCategoryOpen, setNewCategoryOpen] = useState(false)
  const COMPACT_COUNT = 8
  const compactCategories = useMemo(() => {
    if (showAllCategories || visibleCategories.length <= COMPACT_COUNT) return visibleCategories
    const head = visibleCategories.slice(0, COMPACT_COUNT)
    // Keep the selected category visible even when it sits further down the list.
    if (categoryId && !head.some((c) => c.id === categoryId)) {
      const selected = visibleCategories.find((c) => c.id === categoryId)
      if (selected) return [...head.slice(0, COMPACT_COUNT - 1), selected]
    }
    return head
  }, [showAllCategories, visibleCategories, categoryId])
  const tone = type === 'expense' ? 'expense' : type === 'income' || type === 'refund' ? 'income' : 'neutral'

  const submit = (addAnother: boolean) =>
    handleSubmit(async (values) => {
      setLastUsed(values.type, {
        account_id: values.account_id,
        category_id: values.category_id,
        transfer_account_id: values.transfer_account_id,
      })
      await onSubmit(values, { addAnother })
      if (addAnother) {
        reset(
          defaultValues({
            type: values.type,
            account_id: values.account_id,
            category_id: values.category_id,
          }),
        )
        amountRef.current?.focus()
      }
    })

  const err = formState.errors

  return (
    <form
      id={formId}
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        void submit(false)()
      }}
      noValidate
    >
      <Controller
        control={control}
        name="amount"
        render={({ field }) => (
          <Field data-invalid={!!err.amount}>
            <AmountInput
              ref={(el) => {
                field.ref(el)
                ;(amountRef as React.MutableRefObject<HTMLInputElement | null>).current = el
              }}
              id={`${formId}-amount`}
              value={field.value}
              onChange={field.onChange}
              currency={currency}
              tone={tone}
              invalid={!!err.amount}
              autoFocus={mode === 'create'}
              allowNegative={type === 'adjustment'}
            />
            <FieldError errors={[err.amount]} className="text-center" />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="type"
        render={({ field }) =>
          field.value === 'refund' || field.value === 'adjustment' ? (
            <Field>
              <FieldLabel>Type</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Segmented
              aria-label="Transaction type"
              value={field.value}
              onChange={field.onChange}
              options={TYPE_OPTIONS}
              size="lg"
            />
          )
        }
      />

      {categoryType && (
        <Controller
          control={control}
          name="category_id"
          render={({ field }) => (
            <Field data-invalid={!!err.category_id}>
              <FieldLabel>Category</FieldLabel>
              {visibleCategories.length === 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-muted-foreground text-sm">No {categoryType} categories yet.</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => setNewCategoryOpen(true)}>
                    <Plus data-icon="inline-start" /> New category
                  </Button>
                </div>
              ) : (
                <div
                  className="grid grid-cols-4 gap-2 sm:grid-cols-5"
                  role="radiogroup"
                  aria-label="Category"
                >
                  {compactCategories.map((c) => {
                    const active = field.value === c.id
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => field.onChange(active ? undefined : c.id)}
                        className={cn(
                          'flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition-colors',
                          active
                            ? 'border-primary bg-primary/10'
                            : 'bg-muted/50 hover:bg-muted border-transparent',
                        )}
                      >
                        <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                        <span className="line-clamp-2 text-[11px] leading-tight font-medium">{c.name}</span>
                      </button>
                    )
                  })}
                  {visibleCategories.length > COMPACT_COUNT && (
                    <button
                      type="button"
                      onClick={() => setShowAllCategories((v) => !v)}
                      className="bg-muted/50 hover:bg-muted text-muted-foreground flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-transparent p-2 text-center text-[11px] font-medium"
                      aria-expanded={showAllCategories}
                    >
                      {showAllCategories ? (
                        <ChevronUp className="size-5" />
                      ) : (
                        <MoreHorizontal className="size-5" />
                      )}
                      {showAllCategories ? 'Less' : `All ${visibleCategories.length}`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setNewCategoryOpen(true)}
                    className="bg-muted/50 hover:bg-muted text-muted-foreground flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-transparent p-2 text-center text-[11px] font-medium"
                    aria-label="New category"
                  >
                    <Plus className="size-5" />
                    New
                  </button>
                </div>
              )}
              <FieldError errors={[err.category_id]} />
            </Field>
          )}
        />
      )}
      {categoryType && (
        <CategoryFormSheet
          open={newCategoryOpen}
          onOpenChange={setNewCategoryOpen}
          defaultType={categoryType}
          lockType
          onCreated={(c) => {
            setValue('category_id', c.id, { shouldValidate: true, shouldDirty: true })
          }}
        />
      )}

      <div className={cn('grid gap-4', type === 'transfer' && 'sm:grid-cols-2')}>
        <Controller
          control={control}
          name="account_id"
          render={({ field }) => (
            <Field data-invalid={!!err.account_id}>
              <FieldLabel htmlFor={`${formId}-account`}>
                {type === 'transfer' ? 'From account' : 'Account'}
              </FieldLabel>
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <SelectTrigger id={`${formId}-account`} className="w-full" aria-invalid={!!err.account_id}>
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => (
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
        {type === 'transfer' && (
          <Controller
            control={control}
            name="transfer_account_id"
            render={({ field }) => (
              <Field data-invalid={!!err.transfer_account_id}>
                <FieldLabel htmlFor={`${formId}-to-account`}>To account</FieldLabel>
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger
                    id={`${formId}-to-account`}
                    className="w-full"
                    aria-invalid={!!err.transfer_account_id}
                  >
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts
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
        )}
      </div>

      <Controller
        control={control}
        name="transaction_date"
        render={({ field }) => (
          <Field data-invalid={!!err.transaction_date}>
            <FieldLabel htmlFor={`${formId}-date`}>Date</FieldLabel>
            <DateField
              id={`${formId}-date`}
              value={field.value}
              onChange={field.onChange}
              invalid={!!err.transaction_date}
            />
            <FieldError errors={[err.transaction_date]} />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <Field data-invalid={!!err.description}>
            <FieldLabel htmlFor={`${formId}-description`}>Description</FieldLabel>
            <Input
              id={`${formId}-description`}
              placeholder="What was it for"
              {...field}
              value={field.value ?? ''}
            />
            <FieldError errors={[err.description]} />
          </Field>
        )}
      />

      <FormActions
        mode={mode}
        formId={formId}
        submitting={submitting}
        onCancel={onCancel}
        onSaveAnother={allowAddAnother ? () => void submit(true)() : undefined}
      />
    </form>
  )
}

export function FormActions({
  mode,
  submitting,
  onCancel,
  onSaveAnother,
  formId = 'transaction-form',
}: {
  mode: 'create' | 'edit'
  submitting?: boolean
  onCancel?: () => void
  onSaveAnother?: () => void
  formId?: string
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {onCancel && (
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={submitting}
          className="h-10 rounded-xl"
        >
          Cancel
        </Button>
      )}
      {mode === 'create' && onSaveAnother && (
        <Button
          type="button"
          variant="outline"
          onClick={onSaveAnother}
          disabled={submitting}
          className="h-10 rounded-xl"
        >
          Save & add another
        </Button>
      )}
      <Button type="submit" form={formId} disabled={submitting} className="h-10 rounded-xl sm:min-w-28">
        {submitting ? 'Saving…' : mode === 'create' ? 'Save' : 'Save changes'}
      </Button>
    </div>
  )
}
