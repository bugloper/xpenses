import { Link, createRoute } from '@tanstack/react-router'
import { ChevronDown, Eye, EyeOff, MoreVertical, Pencil, Plus, Search, Shapes, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { CategoryFormSheet } from '@/components/categories/CategoryForm'
import { DeleteCategoryDialog } from '@/components/categories/DeleteCategoryDialog'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { PageHeader } from '@/components/common/PageHeader'
import { Segmented } from '@/components/common/Segmented'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
    (g) =>
      g.parent.name.toLowerCase().includes(q) || g.children.some((c) => c.name.toLowerCase().includes(q)),
  )
}

/** Sub-categories that match the query, when the main category itself does not. */
function childMatches(g: CategoryGroup, query: string): Category[] {
  const q = query.trim().toLowerCase()
  if (!q || g.parent.name.toLowerCase().includes(q)) return []
  return g.children.filter((c) => c.name.toLowerCase().includes(q))
}

type Actions = {
  onEdit: (c: Category) => void
  onAddSub: (parentId: string) => void
  onToggleActive: (c: Category) => void
  onDelete: (c: Category) => void
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
  const [deleting, setDeleting] = useState<Category | null>(null)

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

  const toggleActive = (c: Category) =>
    update.mutate(
      { id: c.id, is_active: !c.is_active },
      {
        onSuccess: () => toast.success(c.is_active ? 'Category deactivated' : 'Category activated'),
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  const edit = (category: Category | null, parentId: string | null) => setEditing({ category, parentId })
  const actions: Actions = {
    onEdit: (c) => edit(c, null),
    onAddSub: (parentId) => edit(null, parentId),
    onToggleActive: toggleActive,
    onDelete: setDeleting,
  }
  const props = { groups: shown, query, type, currency, budgets: budgetByCategory, actions }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Setup"
        title="Categories"
        description={
          isPending ? undefined : (
            <>
              {plural(groups.length, 'main categor')} · {subLabel(subCount).toLowerCase()}.
              {type === 'expense' && (
                <>
                  {' '}
                  Monthly limits live on the{' '}
                  <Link to="/budgets" className="text-foreground underline underline-offset-2">
                    Budgets
                  </Link>{' '}
                  page.
                </>
              )}
            </>
          )
        }
        actions={
          <Button onClick={() => edit(null, null)}>
            <Plus data-icon="inline-start" /> New category
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Segmented
          aria-label="Category type"
          value={type}
          onChange={(v) => {
            void navigate({ search: v === 'expense' ? {} : { type: v }, replace: true })
          }}
          options={[
            { value: 'expense', label: 'Expense', tone: 'expense' },
            { value: 'income', label: 'Income', tone: 'income' },
          ]}
        />
        <div className="relative order-last min-w-0 basis-full sm:order-none sm:max-w-xs sm:flex-1 sm:basis-auto">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a category"
            aria-label="Find a category"
            className="h-10 pl-9"
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
        <div className="bg-card rounded-lg border">
          <EmptyState
            icon={Shapes}
            title={`No ${type} categories`}
            action={<Button onClick={() => edit(null, null)}>Create one</Button>}
          />
        </div>
      ) : shown.length === 0 ? (
        <div className="bg-card rounded-lg border">
          <EmptyState
            icon={Search}
            title="No category matches"
            description="Try another word, or create it."
          />
        </div>
      ) : (
        <Accordion {...props} />
      )}
      <DeleteCategoryDialog
        category={deleting}
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
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

type ListProps = {
  groups: CategoryGroup[]
  query: string
  type: CategoryType
  currency: string
  budgets: Map<string, Budget>
  actions: Actions
}

function SubList({
  group,
  query,
  type,
  currency,
  budgets,
  actions,
  inset,
}: {
  group: CategoryGroup
  query: string
  type: CategoryType
  currency: string
  budgets: Map<string, Budget>
  actions: Actions
  inset?: boolean
}) {
  const { parent, children } = group
  const q = query.trim().toLowerCase()
  if (children.length === 0)
    return (
      <p className={cn('text-muted-foreground py-6 text-center text-sm', inset && 'py-4')}>
        No sub-categories yet.
      </p>
    )
  return (
    <ul className="divide-rule divide-y" aria-label={`${parent.name} sub-categories`}>
      {children.map((c) => {
        const budget = type === 'expense' ? budgets.get(c.id) : undefined
        const hit = !!q && c.name.toLowerCase().includes(q)
        return (
          <li
            key={c.id}
            className={cn(
              'flex min-h-14 items-center gap-3 py-2.5',
              inset ? 'pr-2 pl-4 sm:pl-14' : 'px-5',
              hit && 'bg-accent/50',
            )}
          >
            <CategoryIcon
              icon={c.icon}
              color={c.color}
              size="sm"
              className={cn(!c.is_active && 'opacity-60')}
            />
            <div className={cn('min-w-0 flex-1', !c.is_active && 'opacity-60')}>
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{c.name}</p>
                {!c.is_active && <Badge variant="outline">Inactive</Badge>}
              </div>
              {budget && <BudgetLink amount={budget.amount} currency={currency} />}
            </div>
            <RowMenu
              category={c}
              onEdit={actions.onEdit}
              onToggleActive={actions.onToggleActive}
              onDelete={actions.onDelete}
            />
          </li>
        )
      })}
    </ul>
  )
}

/** Phones and tablets: one column; a main category opens in place to show its sub-categories. */
function Accordion({ groups, query, type, currency, budgets, actions }: ListProps) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <ul
      className="bg-card divide-rule divide-y overflow-hidden rounded-lg border"
      aria-label={`${type} categories`}
    >
      {groups.map((g) => {
        const matches = childMatches(g, query)
        const expanded = open.has(g.parent.id) || matches.length > 0
        const panelId = `cat-group-${g.parent.id}`
        return (
          <li key={g.parent.id}>
            <div className={cn('flex items-center gap-1 pr-2', expanded && 'bg-muted/40')}>
              <button
                type="button"
                onClick={() => toggle(g.parent.id)}
                aria-label={g.parent.name}
                aria-expanded={expanded}
                aria-controls={panelId}
                className={cn(
                  'flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left',
                  !g.parent.is_active && 'opacity-60',
                )}
              >
                <CategoryIcon icon={g.parent.icon} color={g.parent.color} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[0.9375rem] font-medium">{g.parent.name}</span>
                    {!g.parent.is_active && <Badge variant="outline">Inactive</Badge>}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {subLabel(g.children.length)}
                    {type === 'expense' && budgets.get(g.parent.id) && ' · budget set'}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    'text-muted-foreground size-4 shrink-0 transition-transform',
                    expanded && 'rotate-180',
                  )}
                />
              </button>
              <RowMenu
                category={g.parent}
                onEdit={actions.onEdit}
                onToggleActive={actions.onToggleActive}
                onAddSub={() => actions.onAddSub(g.parent.id)}
                onDelete={actions.onDelete}
              />
            </div>
            {expanded && (
              <div id={panelId} className="border-t border-dashed">
                {type === 'expense' && budgets.get(g.parent.id) && (
                  <div className="border-b border-dashed py-2.5 pr-4 pl-4 sm:pl-14">
                    <BudgetLink
                      amount={budgets.get(g.parent.id)!.amount}
                      currency={currency}
                      label={`Budget for all of ${g.parent.name}`}
                    />
                  </div>
                )}
                <SubList
                  group={g}
                  query={query}
                  type={type}
                  currency={currency}
                  budgets={budgets}
                  actions={actions}
                  inset
                />
                <div className="border-t border-dashed py-1.5 pr-4 pl-2 sm:pl-12">
                  <Button variant="ghost" size="sm" onClick={() => actions.onAddSub(g.parent.id)}>
                    <Plus data-icon="inline-start" /> Add sub-category
                  </Button>
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function BudgetLink({
  amount,
  currency,
  label = 'Budget',
}: {
  amount: number
  currency: string
  label?: string
}) {
  return (
    <Link to="/budgets" className="text-muted-foreground hover:text-foreground text-xs">
      {label} <Money minor={amount} currency={currency} className="text-foreground font-medium" /> / month
    </Link>
  )
}

function RowMenu({
  category: c,
  onEdit,
  onToggleActive,
  onAddSub,
  onDelete,
}: {
  category: Category
  onEdit?: (c: Category) => void
  onToggleActive: (c: Category) => void
  onAddSub?: () => void
  onDelete: (c: Category) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="size-10" aria-label={`Actions for ${c.name}`}>
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onEdit && (
          <DropdownMenuItem onSelect={() => onEdit(c)}>
            <Pencil /> Edit
          </DropdownMenuItem>
        )}
        {onAddSub && (
          <DropdownMenuItem onSelect={onAddSub}>
            <Plus /> Add sub-category
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onToggleActive(c)}>
          {c.is_active ? <EyeOff /> : <Eye />} {c.is_active ? 'Deactivate' : 'Activate'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(c)}>
          <Trash2 /> Delete
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
