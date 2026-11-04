import { createRoute } from '@tanstack/react-router'
import { Eye, EyeOff, MoreVertical, Pencil, Plus, Shapes } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { BudgetInline } from '@/components/categories/BudgetInline'
import { CategoryFormSheet } from '@/components/categories/CategoryForm'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { PageHeader } from '@/components/common/PageHeader'
import { Segmented } from '@/components/common/Segmented'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { errorMessage } from '@/lib/api'
import { useBudgets, useCategories, useDefaultCurrency, useUpdateCategory } from '@/lib/queries'
import type { Category, CategoryType } from '@/types/api'
import { appRoute } from './__root'

const searchSchema = z.object({ type: z.enum(['expense', 'income']).optional().catch(undefined) })

function CategoriesPage() {
  const search = categoriesRoute.useSearch()
  const navigate = categoriesRoute.useNavigate()
  const type: CategoryType = search.type ?? 'expense'
  const [showInactive, setShowInactive] = useState(false)
  const { data, isPending, error, refetch } = useCategories(showInactive)
  const budgets = useBudgets()
  const update = useUpdateCategory()
  const currency = useDefaultCurrency()
  const [editing, setEditing] = useState<Category | null | undefined>(undefined)

  const list = useMemo(() => (data ?? []).filter((c) => c.type === type), [data, type])
  const budgetByCategory = useMemo(
    () => new Map((budgets.data ?? []).map((b) => [b.category_id, b])),
    [budgets.data],
  )

  const toggleActive = (c: Category) =>
    update.mutate(
      { id: c.id, is_active: !c.is_active },
      {
        onSuccess: () => toast.success(c.is_active ? 'Category deactivated' : 'Category activated'),
        onError: (e) => toast.error(errorMessage(e)),
      },
    )

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Categories"
        actions={
          <Button size="sm" onClick={() => setEditing(null)}>
            <Plus data-icon="inline-start" /> New
          </Button>
        }
      />
      <div className="flex items-center gap-3">
        <Segmented
          className="max-w-xs"
          value={type}
          onChange={(v) => void navigate({ search: v === 'expense' ? {} : { type: v }, replace: true })}
          options={[
            { value: 'expense', label: 'Expense', tone: 'expense' },
            { value: 'income', label: 'Income', tone: 'income' },
          ]}
        />
        <label className="text-muted-foreground ml-auto flex items-center gap-2 text-sm">
          Inactive
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
        </label>
      </div>
      {type === 'expense' && (
        <p className="text-muted-foreground text-xs">
          Tap a budget to set the monthly limit. Set it to 0 to remove it.
        </p>
      )}
      {isPending ? (
        <ListSkeleton rows={6} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Shapes}
          title={`No ${type} categories`}
          action={<Button onClick={() => setEditing(null)}>Create one</Button>}
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.map((c) => (
            <li
              key={c.id}
              className="bg-card ring-foreground/10 flex items-center gap-3 rounded-2xl p-3 ring-1"
            >
              <CategoryIcon icon={c.icon} color={c.color} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  {!c.is_active && (
                    <Badge variant="outline" className="h-5 text-[10px]">
                      Inactive
                    </Badge>
                  )}
                </div>
                {type === 'expense' && c.is_active && (
                  <div className="mt-0.5 -ml-2">
                    <BudgetInline categoryId={c.id} budget={budgetByCategory.get(c.id)} currency={currency} />
                  </div>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.name}`}>
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(c)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => toggleActive(c)}>
                    {c.is_active ? <EyeOff /> : <Eye />} {c.is_active ? 'Deactivate' : 'Activate'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
      <CategoryFormSheet
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        category={editing ?? null}
        defaultType={type}
      />
    </div>
  )
}

export const categoriesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/categories',
  validateSearch: searchSchema,
  component: CategoriesPage,
})
