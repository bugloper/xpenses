import { createRoute } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, Eye, EyeOff, MoreVertical, Pencil, Plus, Shapes } from 'lucide-react'
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
import { groupCategories, type CategoryGroup } from '@/lib/categories'
import { useBudgets, useCategories, useDefaultCurrency, useUpdateCategory } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { Budget, Category, CategoryType } from '@/types/api'
import { appRoute } from './__root'

const searchSchema = z.object({ type: z.enum(['expense', 'income']).optional().catch(undefined) })

type Editing = { category: Category | null; parentId: string | null } | null

function CategoriesPage() {
  const search = categoriesRoute.useSearch()
  const navigate = categoriesRoute.useNavigate()
  const type: CategoryType = search.type ?? 'expense'
  const [showInactive, setShowInactive] = useState(false)
  const { data, isPending, error, refetch } = useCategories(showInactive)
  const budgets = useBudgets()
  const update = useUpdateCategory()
  const currency = useDefaultCurrency()
  const [editing, setEditing] = useState<Editing>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const groups = useMemo(
    () => groupCategories(data ?? [], type, { includeInactive: showInactive }),
    [data, type, showInactive],
  )
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
          <Button size="sm" onClick={() => setEditing({ category: null, parentId: null })}>
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
      <p className="text-muted-foreground text-xs">
        Main categories hold sub-categories. Tap one to see its sub-categories
        {type === 'expense' ? '; tap a budget to set a monthly limit (0 removes it).' : '.'}
      </p>
      {isPending ? (
        <ListSkeleton rows={6} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Shapes}
          title={`No ${type} categories`}
          action={<Button onClick={() => setEditing({ category: null, parentId: null })}>Create one</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((g) => (
            <GroupCard
              key={g.parent.id}
              group={g}
              type={type}
              currency={currency}
              budgets={budgetByCategory}
              open={open[g.parent.id] ?? false}
              onToggle={() => setOpen((o) => ({ ...o, [g.parent.id]: !(o[g.parent.id] ?? false) }))}
              onEdit={(c) => setEditing({ category: c, parentId: null })}
              onAddSub={() => setEditing({ category: null, parentId: g.parent.id })}
              onToggleActive={toggleActive}
            />
          ))}
        </ul>
      )}
      <CategoryFormSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        category={editing?.category ?? null}
        defaultType={type}
        defaultParentId={editing?.parentId ?? null}
      />
    </div>
  )
}

function GroupCard({
  group,
  type,
  currency,
  budgets,
  open,
  onToggle,
  onEdit,
  onAddSub,
  onToggleActive,
}: {
  group: CategoryGroup
  type: CategoryType
  currency: string
  budgets: Map<string, Budget>
  open: boolean
  onToggle: () => void
  onEdit: (c: Category) => void
  onAddSub: () => void
  onToggleActive: (c: Category) => void
}) {
  const { parent, children } = group
  return (
    <li className="bg-card ring-foreground/10 rounded-2xl ring-1">
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${parent.name}`}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <CategoryIcon icon={parent.icon} color={parent.color} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{parent.name}</span>
              {!parent.is_active && (
                <Badge variant="outline" className="h-5 text-[10px]">
                  Inactive
                </Badge>
              )}
            </span>
            <span className="text-muted-foreground block text-xs">
              {children.length === 0
                ? 'No sub-categories'
                : `${children.length} sub-categor${children.length === 1 ? 'y' : 'ies'}`}
            </span>
          </span>
          {open ? (
            <ChevronDown className="text-muted-foreground size-4 shrink-0" />
          ) : (
            <ChevronRight className="text-muted-foreground size-4 shrink-0" />
          )}
        </button>
        <RowMenu category={parent} onEdit={onEdit} onToggleActive={onToggleActive} onAddSub={onAddSub} />
      </div>
      {open && (
        <ul className="border-t px-3 py-2" aria-label={`${parent.name} sub-categories`}>
          {type === 'expense' && parent.is_active && (
            <li className="text-muted-foreground flex items-center justify-between gap-3 py-1.5 text-xs">
              <span>Budget for all of {parent.name}</span>
              <BudgetInline categoryId={parent.id} budget={budgets.get(parent.id)} currency={currency} />
            </li>
          )}
          {children.map((c) => (
            <li key={c.id} className={cn('flex items-center gap-3 py-2', !c.is_active && 'opacity-60')}>
              <CategoryIcon icon={c.icon} color={c.color} size="sm" />
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
                  <div className="-ml-2">
                    <BudgetInline categoryId={c.id} budget={budgets.get(c.id)} currency={currency} />
                  </div>
                )}
              </div>
              <RowMenu category={c} onEdit={onEdit} onToggleActive={onToggleActive} />
            </li>
          ))}
          <li className="py-1.5">
            <Button variant="ghost" size="sm" onClick={onAddSub}>
              <Plus data-icon="inline-start" /> Add sub-category
            </Button>
          </li>
        </ul>
      )}
    </li>
  )
}

function RowMenu({
  category: c,
  onEdit,
  onToggleActive,
  onAddSub,
}: {
  category: Category
  onEdit: (c: Category) => void
  onToggleActive: (c: Category) => void
  onAddSub?: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.name}`}>
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(c)}>
          <Pencil /> Edit
        </DropdownMenuItem>
        {onAddSub && (
          <DropdownMenuItem onSelect={onAddSub}>
            <Plus /> Add sub-category
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onToggleActive(c)}>
          {c.is_active ? <EyeOff /> : <Eye />} {c.is_active ? 'Deactivate' : 'Activate'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const categoriesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/categories',
  validateSearch: searchSchema,
  component: CategoriesPage,
})
