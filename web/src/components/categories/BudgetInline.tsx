import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Money } from '@/components/common/Money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/api'
import { minorToDecimalString, parseAmount } from '@/lib/money'
import { useDeleteBudget, useUpsertBudget } from '@/lib/queries'
import type { Budget } from '@/types/api'

/** Inline monthly budget editor for one expense category. */
export function BudgetInline({
  categoryId,
  budget,
  currency,
}: {
  categoryId: string
  budget?: Budget
  currency: string
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const upsert = useUpsertBudget()
  const del = useDeleteBudget()
  const busy = upsert.isPending || del.isPending

  const save = async () => {
    const minor = parseAmount(value)
    if (minor === null || minor < 0) {
      toast.error('Enter a valid amount')
      return
    }
    try {
      if (minor === 0) {
        if (budget) await del.mutateAsync(budget.id)
      } else {
        await upsert.mutateAsync({ id: budget?.id, category_id: categoryId, amount: minor })
      }
      toast.success(minor === 0 ? 'Budget removed' : 'Budget saved')
      setEditing(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  if (editing) {
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Input
          autoFocus
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0.00"
          aria-label="Monthly budget"
          className="tabular h-8 w-28 text-right"
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        />
        <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save budget" disabled={busy}>
          <Check />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Cancel"
          onClick={() => setEditing(false)}
        >
          <X />
        </Button>
      </form>
    )
  }
  return (
    <button
      type="button"
      onClick={() => {
        setValue(budget ? minorToDecimalString(budget.amount) : '')
        setEditing(true)
      }}
      className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md px-2 py-1 text-xs transition-colors"
    >
      {budget ? (
        <>
          <Money minor={budget.amount} currency={currency} className="text-foreground font-medium" /> / month
        </>
      ) : (
        'Set budget'
      )}
    </button>
  )
}
