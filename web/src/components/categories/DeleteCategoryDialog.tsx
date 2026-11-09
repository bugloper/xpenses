import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/api'
import { useCategoryUsage, useDeleteCategory } from '@/lib/queries'
import type { Category } from '@/types/api'

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

/**
 * Deleting a category. A main category goes with its sub-categories; the
 * transactions in them are kept and become uncategorised, recurring rules
 * lose the category, and budgets on them are removed. The dialog spells out
 * exactly that, from the server's counts, before anything happens.
 */
export function DeleteCategoryDialog({
  category,
  open,
  onOpenChange,
  onDeleted,
}: {
  category: Category | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: (c: Category) => void
}) {
  const usage = useCategoryUsage(category?.id ?? '', open)
  const del = useDeleteCategory()
  if (!category) return null
  const u = usage.data
  const effects = u
    ? [
        u.sub_categories > 0 &&
          `its ${plural(u.sub_categories, 'sub-category', 'sub-categories')} ${u.sub_categories === 1 ? 'is' : 'are'} deleted too`,
        u.transactions > 0 &&
          `${plural(u.transactions, 'transaction', 'transactions')} ${u.transactions === 1 ? 'stays' : 'stay'} and ${u.transactions === 1 ? 'becomes' : 'become'} Uncategorised`,
        u.budgets > 0 &&
          `${plural(u.budgets, 'budget', 'budgets')} ${u.budgets === 1 ? 'is' : 'are'} removed`,
        u.recurring > 0 &&
          `${plural(u.recurring, 'recurring rule', 'recurring rules')} ${u.recurring === 1 ? 'keeps' : 'keep'} running without a category`,
      ].filter((x): x is string => !!x)
    : []

  const remove = () =>
    del.mutate(category.id, {
      onSuccess: () => {
        toast.success('Category deleted')
        onOpenChange(false)
        onDeleted?.(category)
      },
      onError: (e) => toast.error(errorMessage(e, 'Could not delete the category')),
    })

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {category.name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-muted-foreground text-sm">
              {usage.isPending ? (
                <p>Checking what uses this category…</p>
              ) : usage.error ? (
                <p>{errorMessage(usage.error)}</p>
              ) : effects.length === 0 ? (
                <p>Nothing uses this category. It is removed for good.</p>
              ) : (
                <>
                  <p>It is removed for good, and:</p>
                  <ul className="mt-2 flex flex-col gap-1 border-l-2 pl-3">
                    {effects.map((e) => (
                      <li key={e}>{e.charAt(0).toUpperCase() + e.slice(1)}.</li>
                    ))}
                  </ul>
                  <p className="mt-2">To hide it but keep everything as it is, deactivate it instead.</p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
          <Button
            className="bg-destructive hover:bg-destructive/90 text-white"
            onClick={remove}
            disabled={usage.isPending || !!usage.error || del.isPending}
          >
            {del.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
            Delete category
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
