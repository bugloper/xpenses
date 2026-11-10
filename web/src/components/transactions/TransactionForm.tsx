import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { CategoryField } from '@/components/categories/CategoryField'
import { DateField } from '@/components/common/DateField'
import { SaveToGoal } from '@/components/savings/SaveToGoal'
import { Segmented } from '@/components/common/Segmented'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { today } from '@/lib/dates'
import { getLastUsed, setLastUsed } from '@/lib/last-used'
import { pushRecentCategory } from '@/lib/recent-categories'
import { formatMoney, minorToDecimalString, parseAmount } from '@/lib/money'
import { useAccounts, useCategories } from '@/lib/queries'
import { NEW_LOAN, isLoanType } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import {
  LOAN_TYPES,
  TRANSACTION_TYPES,
  type Account,
  type CreateTransactionRequest,
  type LoanTransactionType,
  type Transaction,
  type TransactionType,
} from '@/types/api'
import { AmountInput } from './AmountInput'
import { LoanFields } from './LoanFields'

export const transactionSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES as [TransactionType, ...TransactionType[]]),
    amount: z.string(),
    account_id: z.string().min(1, 'Select an account'),
    transfer_account_id: z.string().optional(),
    category_id: z.string().optional(),
    transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
    description: z.string().max(500, 'Too long').optional(),
    /** The loan a loan movement belongs to, or NEW_LOAN to start one. */
    loan_id: z.string().optional(),
    counterparty: z.string().max(120, 'Too long').optional(),
    due_date: z.string().optional(),
    interest: z.string().optional(),
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
    if (isLoanType(v.type)) {
      if (v.loan_id === NEW_LOAN && (v.type === 'loan_given' || v.type === 'loan_received')) {
        if (!v.counterparty?.trim())
          ctx.addIssue({ code: 'custom', path: ['counterparty'], message: 'Enter a name' })
        if (v.due_date && v.due_date < v.transaction_date)
          ctx.addIssue({ code: 'custom', path: ['due_date'], message: 'Must not be before the loan' })
      } else if (!v.loan_id || v.loan_id === NEW_LOAN) {
        ctx.addIssue({ code: 'custom', path: ['loan_id'], message: 'Pick the loan' })
      }
      if (v.interest && v.interest.trim() !== '') {
        const i = parseAmount(v.interest)
        if (i === null || i < 0)
          ctx.addIssue({ code: 'custom', path: ['interest'], message: 'Enter a valid amount' })
      }
    }
  })

export type TransactionFormValues = z.infer<typeof transactionSchema>

/** Converts validated form values into the API payload. */
export function toCreateRequest(v: TransactionFormValues, currency: string): CreateTransactionRequest {
  const amount = parseAmount(v.amount) ?? 0
  const isTransfer = v.type === 'transfer'
  const hasCategory = v.type === 'expense' || v.type === 'income' || v.type === 'refund'
  const req: CreateTransactionRequest = {
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
  if (isLoanType(v.type)) {
    if (v.loan_id === NEW_LOAN) {
      req.new_loan = { counterparty: v.counterparty?.trim() ?? '', due_date: v.due_date || null }
    } else {
      req.loan_id = v.loan_id ?? null
    }
    const interest = v.interest ? parseAmount(v.interest) : null
    if (interest && (v.type === 'loan_repayment' || v.type === 'loan_repayment_received'))
      req.interest = interest
  }
  return req
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
    loan_id: tx.loan_id ?? undefined,
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
    loan_id: isLoanType(type) && (type === 'loan_given' || type === 'loan_received') ? NEW_LOAN : undefined,
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

/** The loan movement picked last, so Loan reopens on it. */
let lastLoanType: LoanTransactionType | null = null
function getLastLoanType() {
  return lastLoanType
}

/** The form's first choice. Refunds sit under Money in, loan movements under Loan. */
type Kind = 'expense' | 'income' | 'transfer' | 'loan'
const KIND_OPTIONS: { value: Kind; label: string; tone?: 'income' | 'expense' }[] = [
  { value: 'expense', label: 'Expense', tone: 'expense' },
  { value: 'income', label: 'Income', tone: 'income' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'loan', label: 'Loan' },
]
function kindOf(type: TransactionType): Kind | null {
  if (isLoanType(type)) return 'loan'
  if (type === 'refund') return 'income'
  if (type === 'expense' || type === 'income' || type === 'transfer') return type
  return null
}
const LOAN_OPTIONS = LOAN_TYPES.map((value) => ({
  value,
  label: {
    loan_given: 'Lend',
    loan_received: 'Borrow',
    loan_repayment: 'Repay',
    loan_repayment_received: 'Get repaid',
  }[value],
}))
/** What each kind of entry means for the user's money, said before they save it. */
export const TYPE_MEANING: Record<TransactionType | 'save', string> = {
  expense: 'Money you spent. Counts as spending.',
  income: 'Money you earned. Counts as income.',
  refund: 'Money back on something you bought. Comes off spending in its category.',
  transfer: 'Money moved between your own accounts. Neither income nor spending.',
  save: 'Money set aside for a savings goal. Never spending.',
  adjustment: 'Corrects a balance to match the bank. Neither income nor spending.',
  loan_given: 'Money you lend. It is owed back to you, so it is not spending.',
  loan_received: 'Money you borrow. You owe it back, so it is not income.',
  loan_repayment: 'Paying back what you borrowed. Not spending; any interest is.',
  loan_repayment_received: 'Money paid back to you. Not income; any interest is.',
}
const TRANSFER_OPTIONS: { value: 'accounts' | 'goal'; label: string }[] = [
  { value: 'accounts', label: 'Between accounts' },
  { value: 'goal', label: 'Toward a goal' },
]
const INCOME_OPTIONS: { value: 'income' | 'refund'; label: string }[] = [
  { value: 'income', label: 'Earned' },
  { value: 'refund', label: 'Refund' },
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
  // Transfer › Toward a goal: the sheet becomes the save-to-goal form.
  const [saving, setSaving] = useState(false)

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
    // Lending and borrowing start a new loan unless one is picked; a
    // repayment has to name its loan.
    setValue('loan_id', type === 'loan_given' || type === 'loan_received' ? NEW_LOAN : undefined)
  }, [type, mode, setValue])

  // A refund gives back money spent, so it takes the expense category it refunds.
  const categoryType =
    type === 'expense' || type === 'refund' ? 'expense' : type === 'income' ? 'income' : null
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

  const tone = type === 'expense' ? 'expense' : type === 'income' || type === 'refund' ? 'income' : 'neutral'
  const kind = kindOf(type)
  const loanType = isLoanType(type) ? type : null
  const moneyIn = type === 'loan_received' || type === 'loan_repayment_received'

  const submit = (addAnother: boolean) =>
    handleSubmit(async (values) => {
      if (isLoanType(values.type)) lastLoanType = values.type
      setLastUsed(values.type, {
        account_id: values.account_id,
        category_id: values.category_id,
        transfer_account_id: values.transfer_account_id,
      })
      if (categoryType) pushRecentCategory(categoryType, values.category_id)
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
  const typeSelector = (
    <>
      <Controller
        control={control}
        name="type"
        render={({ field }) =>
          kind === null ? (
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
            <div className="flex flex-col gap-2">
              <Segmented
                aria-label="Transaction type"
                value={kind}
                onChange={(k) => {
                  if (k !== 'transfer') setSaving(false)
                  field.onChange(k === 'loan' ? (getLastLoanType() ?? 'loan_given') : (k as TransactionType))
                }}
                options={KIND_OPTIONS}
                size="lg"
                className="w-full sm:w-full"
              />
              {loanType && (
                <Segmented
                  aria-label="Kind of loan"
                  value={loanType}
                  onChange={(t: LoanTransactionType) => field.onChange(t)}
                  options={LOAN_OPTIONS}
                  size="md"
                  className="w-full sm:w-full"
                />
              )}
              {type === 'transfer' && mode === 'create' && (
                <Segmented
                  aria-label="Kind of transfer"
                  value={saving ? 'goal' : 'accounts'}
                  onChange={(v) => setSaving(v === 'goal')}
                  options={TRANSFER_OPTIONS}
                  size="md"
                  className="w-full sm:w-full"
                />
              )}
              {(type === 'income' || type === 'refund') && (
                <Segmented
                  aria-label="Kind of income"
                  value={type}
                  onChange={(t) => field.onChange(t)}
                  options={INCOME_OPTIONS}
                  size="md"
                  className="w-full sm:w-full"
                />
              )}
              <p className="text-muted-foreground px-0.5 text-[0.8125rem]" aria-live="polite">
                {TYPE_MEANING[saving && type === 'transfer' ? 'save' : type]}
              </p>
            </div>
          )
        }
      />
    </>
  )

  if (saving && type === 'transfer')
    return (
      <div className="flex flex-col gap-5">
        {typeSelector}
        <SaveToGoal currency={currency} onDone={onCancel} />
      </div>
    )

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
      {typeSelector}
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

      {categoryType && (
        <Controller
          control={control}
          name="category_id"
          render={({ field }) => (
            <Field data-invalid={!!err.category_id}>
              <FieldLabel htmlFor={`${formId}-category`}>
                {type === 'refund' ? 'What was refunded' : 'Category'}
              </FieldLabel>
              <CategoryField
                id={`${formId}-category`}
                categories={categories}
                type={categoryType}
                value={field.value}
                onChange={field.onChange}
                invalid={!!err.category_id}
              />
              <FieldError errors={[err.category_id]} />
            </Field>
          )}
        />
      )}

      {loanType && (
        <LoanFields
          control={control}
          type={loanType}
          errors={err}
          mode={mode}
          formId={formId}
          currency={currency}
        />
      )}

      <div className={cn('grid gap-5', type === 'transfer' && 'sm:grid-cols-2 sm:gap-4')}>
        <Controller
          control={control}
          name="account_id"
          render={({ field }) => (
            <Field data-invalid={!!err.account_id}>
              <FieldLabel htmlFor={`${formId}-account`}>
                {type === 'transfer' || (loanType && !moneyIn)
                  ? 'From account'
                  : loanType
                    ? 'Into account'
                    : 'Account'}
              </FieldLabel>
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <SelectTrigger id={`${formId}-account`} className="w-full" aria-invalid={!!err.account_id}>
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <AccountOption account={a} />
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
                          <AccountOption account={a} />
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

/** An account in a picker: its name, and what it holds now, so the choice is informed. */
function AccountOption({ account }: { account: Account }) {
  return (
    <span className="flex w-full items-baseline justify-between gap-3">
      <span className="truncate">{account.name}</span>
      <span className="text-muted-foreground font-mono text-xs tabular-nums">
        {formatMoney(account.current_balance, account.currency)}
      </span>
    </span>
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
  // Pinned to the bottom of the sheet so Save is always one tap away on a phone.
  return (
    <div
      data-slot="form-actions"
      className="bg-card sticky bottom-0 z-10 -mx-4 -mb-4 flex items-center gap-2 border-t px-4 py-3 lg:-mx-5 lg:px-5"
    >
      {onCancel && (
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={submitting}
          className="max-sm:px-2.5"
        >
          Cancel
        </Button>
      )}
      <span className="flex-1" />
      {mode === 'create' && onSaveAnother && (
        <Button type="button" variant="outline" onClick={onSaveAnother} disabled={submitting}>
          Save & add another
        </Button>
      )}
      <Button type="submit" form={formId} disabled={submitting} className="min-w-24">
        {submitting ? 'Saving…' : mode === 'create' ? 'Save' : 'Save changes'}
      </Button>
    </div>
  )
}
