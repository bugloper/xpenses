import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CategoryField } from '@/components/categories/CategoryField'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { AmountInput } from '@/components/transactions/AmountInput'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { errorMessage } from '@/lib/api'
import { categoryLabel } from '@/lib/categories'
import { minorToDecimalString, parseAmount } from '@/lib/money'
import { useBudgets, useCategories, useDeleteBudget, useUpsertBudget } from '@/lib/queries'

export type BudgetDraft = { id?: string; category_id?: string; amount?: number }

/**
 * Set or change a monthly budget: a big amount field first, then the
 * category picker (main or sub-category). Mirrors the add-transaction form.
 */
export function BudgetFormSheet({
  open,
  onOpenChange,
  draft,
  currency,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Existing budget to edit, or a pre-chosen category for a new one. */
  draft?: BudgetDraft | null
  currency: string
}) {
  const { data: categories = [] } = useCategories()
  const { data: budgets = [] } = useBudgets()
  const upsert = useUpsertBudget()
  const del = useDeleteBudget()
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined)
  const [errors, setErrors] = useState<{ amount?: string; category?: string }>({})
  // Each open hands in a fresh draft object; reset the fields when it changes.
  const [seenDraft, setSeenDraft] = useState<BudgetDraft | null | undefined>(undefined)
  if (seenDraft !== draft) {
    setSeenDraft(draft)
    setAmount(draft?.amount ? minorToDecimalString(draft.amount) : '')
    setCategoryId(draft?.category_id)
    setErrors({})
  }

  const editing = !!draft?.id
  // A category can hold one budget: choosing one that already has a budget edits it.
  const existing = budgets.find((b) => b.category_id === categoryId)
  const busy = upsert.isPending || del.isPending

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const minor = parseAmount(amount)
    const next: typeof errors = {}
    if (minor === null || minor <= 0) next.amount = 'Enter an amount above zero'
    if (!categoryId) next.category = 'Choose a category'
    setErrors(next)
    if (next.amount || next.category || minor === null || !categoryId) return
    try {
      await upsert.mutateAsync({ id: existing?.id ?? draft?.id, category_id: categoryId, amount: minor })
      toast.success(existing || editing ? 'Budget updated' : 'Budget set')
      onOpenChange(false)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const remove = async () => {
    const id = draft?.id ?? existing?.id
    if (!id) return
    try {
      await del.mutateAsync(id)
      toast.success('Budget removed')
      onOpenChange(false)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit budget' : 'New budget'}
      description="Monthly limit for one category. A main category's budget covers its sub-categories."
      footer={
        <div className="flex items-center gap-2">
          {(editing || existing) && (
            <Button
              type="button"
              variant="ghost"
              className="text-expense"
              onClick={() => void remove()}
              disabled={busy}
            >
              <Trash2 data-icon="inline-start" /> Remove
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button form="budget-form" type="submit" disabled={busy}>
              {busy ? 'Saving…' : editing || existing ? 'Save budget' : 'Set budget'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="budget-form" className="flex flex-col gap-5" onSubmit={(e) => void submit(e)} noValidate>
        <Field data-invalid={!!errors.amount}>
          <FieldLabel htmlFor="budget-amount" className="sr-only">
            Monthly amount
          </FieldLabel>
          <AmountInput
            id="budget-amount"
            value={amount}
            onChange={(v) => {
              setAmount(v)
              if (errors.amount) setErrors((er) => ({ ...er, amount: undefined }))
            }}
            currency={currency}
            tone="neutral"
            invalid={!!errors.amount}
            autoFocus
          />
          <p className="text-muted-foreground text-center text-xs">per month</p>
          <FieldError errors={[errors.amount ? { message: errors.amount } : undefined]} />
        </Field>
        <Field data-invalid={!!errors.category}>
          <FieldLabel htmlFor="budget-category">Category</FieldLabel>
          <CategoryField
            id="budget-category"
            categories={categories}
            type="expense"
            value={categoryId}
            onChange={(id) => {
              setCategoryId(id)
              if (errors.category) setErrors((er) => ({ ...er, category: undefined }))
              const b = budgets.find((x) => x.category_id === id)
              if (b && !amount) setAmount(minorToDecimalString(b.amount))
            }}
            invalid={!!errors.category}
            showRecent={false}
          />
          {existing && !editing && categoryId && (
            <p className="text-muted-foreground text-xs">
              {categoryLabel(categories, categoryId)} already has a budget; saving replaces it.
            </p>
          )}
          <FieldError errors={[errors.category ? { message: errors.category } : undefined]} />
        </Field>
      </form>
    </ResponsiveSheet>
  )
}
