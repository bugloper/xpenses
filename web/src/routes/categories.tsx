import { Link, createRoute } from '@tanstack/react-router'
import { Eye, EyeOff, MoreVertical, Pencil, Plus, Search, Shapes } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { CategoryFormSheet } from '@/components/categories/CategoryForm'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { PageHeader } from '@/components/common/PageHeader'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
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
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { errorMessage } from '@/lib/api'
import { groupCategories, type CategoryGroup } from '@/lib/categories'
import { useBudgets, useCategories, useDefaultCurrency, useUpdateCategory } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { Budget, Category, CategoryType } from '@/types/api'
import { appRoute } from './__root'

const searchSchema = z.object({ type: z.enum(['expense', 'income']).optional().catch(undefined) })

type Editing = { category: Category | null; parentId: string | null } | null

const plural = (n: number, stem: string) => `${n} ${stem}${n === 1 ? 'y' : 'ies'}`
const subLabel = (n: number) => (n === 0 ? 'No sub-categories' : `${n} sub-categor${n === 1 ? 'y' : 'ies'}`)

/** Groups whose main category or any sub-category matches the query. */
function filterGroups(groups: CategoryGroup[], query: string): CategoryGroup[] {
  const q = query.trim().toLowerCase()
  if (!q) return groups
  return groups.filter(
    (g) => g.parent.name.toLowerCase().includes(q) || g.children.some((c) => c.name.toLowerCase().includes(q)),
  )
}

function CategoriesPage() {
  const search = categoriesRoute.useSearch()
  const navigate = categoriesRoute.useNavigate()
  const type: CategoryType = search.type ?? 'expense'
  const [showInactive, setShowInactive] = useState(false)
  const [query, setQuery] = useState('')
  const { data, isPending, error, refetch } = useCategories(showInactive)
  const budgets = useBudgets()
  const update = useUpdateCategory()
  const currency = useDefaultCurrency()
  const [editing, setEditing] = useState<Editing>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const groups = useMemo(
    () => groupCategories(data ?? [], type, { includeInactive: showInactive }),
    [data, type, showInactive],
  )
  const shown = useMemo(() => filterGroups(groups, query), [groups, query])
  const subCount = groups.reduce((n, g) => n + g.children.length, 0)
  const budgetByCategory = useMemo(
    () => new Map((budgets.data ?? []).map((b) => [b.category_id, b])),
    [budgets.data],
  )
  const openGroup = groups.find((g) => g.parent.id === openId) ?? null

  const toggleActive = (c: Category) =>
    update.mutate(
      { id: c.id, is_active: !c.is_active },
      {
        onSuccess: () => toast.success(c.is_active ? 'Category deactivated' : 'Category activated'),
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  // The form opens on top of everything else, so the group sheet gives way to it.
  const edit = (category: Category | null, parentId: string | null) => {
    setOpenId(null)
    setEditing({ category, parentId })
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Categories"
        description={
          isPending ? undefined : (
            <>
              {plural(groups.length, 'categor')} · {subLabel(subCount).toLowerCase()}.
              {type === 'expense' && (
                <>
                  {' '}
                  Monthly limits live on the{' '}
                  <Link to="/budgets" className="text-primary underline underline-offset-2">
                    Budgets
                  </Link>{' '}
                  page.
                </>
              )}
            </>
          )
        }
        actions={
          <Button size="sm" onClick={() => edit(null, null)}>
            <Plus data-icon="inline-start" /> New category
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          className="w-auto"
          value={type}
          onChange={(v) => void navigate({ search: v === 'expense' ? {} : { type: v }, replace: true })}
          options={[
            { value: 'expense', label: 'Expense', tone: 'expense' },
            { value: 'income', label: 'Income', tone: 'income' },
          ]}
        />
        <div className="relative order-last min-w-0 basis-full sm:order-none sm:basis-auto sm:flex-1 sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a category"
            aria-label="Find a category"
            className="h-10 rounded-full pl-9"
          />
        </div>
        <label className="text-muted-foreground ml-auto flex items-center gap-2 text-sm">
          Show inactive
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
        </label>
      </div>
      {isPending ? (
        <ListSkeleton rows={6} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Shapes}
          title={`No ${type} categories`}
          action={<Button onClick={() => edit(null, null)}>Create one</Button>}
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={Search} title="No category matches" description="Try another word, or create it." />
      ) : (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4" aria-label={`${type} categories`}>
          {shown.map((g) => (
            <CategoryCard
              key={g.parent.id}
              group={g}
              onOpen={() => setOpenId(g.parent.id)}
              onEdit={(c) => edit(c, null)}
              onAddSub={() => edit(null, g.parent.id)}
              onToggleActive={toggleActive}
            />
          ))}
        </ul>
      )}
      <GroupSheet
        group={openGroup}
        type={type}
        currency={currency}
        budgets={budgetByCategory}
        onOpenChange={(o) => !o && setOpenId(null)}
        onEdit={(c) => edit(c, null)}
        onAddSub={() => openGroup && edit(null, openGroup.parent.id)}
        onToggleActive={toggleActive}
      />
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

/** A main category as a tile: icon, name, how many sub-categories; opens the group. */
function CategoryCard({
  group,
  onOpen,
  onEdit,
  onAddSub,
  onToggleActive,
}: {
  group: CategoryGroup
  onOpen: () => void
  onEdit: (c: Category) => void
  onAddSub: () => void
  onToggleActive: (c: Category) => void
}) {
  const { parent, children } = group
  return (
    <li className={cn('bg-card relative rounded-[1.25rem] border transition-colors', !parent.is_active && 'opacity-70')}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={parent.name}
        className="hover:bg-muted/40 flex h-full w-full flex-col items-start gap-3 rounded-[1.25rem] p-3 pr-11 text-left sm:gap-4 sm:p-4 sm:pr-12"
      >
        <CategoryIcon icon={parent.icon} color={parent.color} size="md" className="rounded-xl sm:size-14 sm:rounded-2xl sm:[&>svg]:size-7" />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm leading-tight font-semibold sm:text-base">{parent.name}</span>
            {!parent.is_active && (
              <Badge variant="outline" className="h-5 text-[10px]">
                Inactive
              </Badge>
            )}
          </span>
          <span className="text-muted-foreground mt-1 block text-xs sm:text-sm">{subLabel(children.length)}</span>
        </span>
      </button>
      <div className="absolute top-3 right-3">
        <RowMenu category={parent} onEdit={onEdit} onToggleActive={onToggleActive} onAddSub={onAddSub} />
      </div>
    </li>
  )
}

/** The sub-categories of one main category, in a sheet. */
function GroupSheet({
  group,
  type,
  currency,
  budgets,
  onOpenChange,
  onEdit,
  onAddSub,
  onToggleActive,
}: {
  group: CategoryGroup | null
  type: CategoryType
  currency: string
  budgets: Map<string, Budget>
  onOpenChange: (o: boolean) => void
  onEdit: (c: Category) => void
  onAddSub: () => void
  onToggleActive: (c: Category) => void
}) {
  const parent = group?.parent
  const children = group?.children ?? []
  return (
    <ResponsiveSheet
      open={group !== null}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-3">
          {parent && <CategoryIcon icon={parent.icon} color={parent.color} size="sm" />}
          {parent?.name ?? ''}
        </span>
      }
      description={subLabel(children.length)}
      footer={
        <Button variant="outline" className="w-full" onClick={onAddSub}>
          <Plus data-icon="inline-start" /> Add sub-category
        </Button>
      }
    >
      {parent && (
        <ul className="divide-y" aria-label={`${parent.name} sub-categories`}>
          {type === 'expense' && budgets.get(parent.id) && (
            <li className="text-muted-foreground flex items-center justify-between gap-3 py-2.5 text-xs">
              <span>Budget for all of {parent.name}</span>
              <BudgetLink amount={budgets.get(parent.id)!.amount} currency={currency} />
            </li>
          )}
          {children.length === 0 && (
            <li className="text-muted-foreground py-6 text-center text-sm">No sub-categories yet.</li>
          )}
          {children.map((c) => (
            <li key={c.id} className={cn('flex items-center gap-3 py-2.5', !c.is_active && 'opacity-60')}>
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
                {type === 'expense' && budgets.get(c.id) && (
                  <BudgetLink amount={budgets.get(c.id)!.amount} currency={currency} />
                )}
              </div>
              <RowMenu category={c} onEdit={onEdit} onToggleActive={onToggleActive} />
            </li>
          ))}
        </ul>
      )}
    </ResponsiveSheet>
  )
}

function BudgetLink({ amount, currency }: { amount: number; currency: string }) {
  return (
    <Link to="/budgets" className="text-muted-foreground hover:text-foreground text-xs">
      Budget <Money minor={amount} currency={currency} className="text-foreground font-medium" /> / month
    </Link>
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
