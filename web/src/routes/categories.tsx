import { Link, createRoute } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Shapes,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { CategoryFormSheet } from '@/components/categories/CategoryForm'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useIsDesktop } from '@/hooks/useMediaQuery'
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
}

function CategoriesPage() {
  const search = categoriesRoute.useSearch()
  const navigate = categoriesRoute.useNavigate()
  const type: CategoryType = search.type ?? 'expense'
  const desktop = useIsDesktop()
  const [showInactive, setShowInactive] = useState(false)
  const [query, setQuery] = useState('')
  const { data, isPending, error, refetch } = useCategories(showInactive)
  const budgets = useBudgets()
  const update = useUpdateCategory()
  const currency = useDefaultCurrency()
  const [editing, setEditing] = useState<Editing>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
            setSelectedId(null)
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
      ) : desktop ? (
        <TwoPane {...props} selectedId={selectedId} onSelect={setSelectedId} />
      ) : (
        <Accordion {...props} />
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

type ListProps = {
  groups: CategoryGroup[]
  query: string
  type: CategoryType
  currency: string
  budgets: Map<string, Budget>
  actions: Actions
}

/** Desktop: the main categories down the left, the chosen one's sub-categories on the right. */
function TwoPane({
  groups,
  query,
  type,
  currency,
  budgets,
  actions,
  selectedId,
  onSelect,
}: ListProps & { selectedId: string | null; onSelect: (id: string) => void }) {
  const selected = groups.find((g) => g.parent.id === selectedId) ?? groups[0]!
  return (
    <div className="grid grid-cols-12 items-start gap-6">
      <section className="bg-card col-span-5 overflow-hidden rounded-lg border xl:col-span-4">
        <header className="flex items-baseline justify-between border-b px-4 py-3">
          <h2 className="eyebrow text-foreground/80">Main categories</h2>
          <span className="eyebrow">{groups.length}</span>
        </header>
        <ul className="divide-rule divide-y" aria-label={`${type} categories`}>
          {groups.map((g) => {
            const on = g.parent.id === selected.parent.id
            const matches = childMatches(g, query)
            return (
              <li key={g.parent.id} className="relative">
                <span
                  aria-hidden
                  className={cn(
                    'bg-saffron absolute inset-y-0 left-0 w-[3px]',
                    on ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <button
                  type="button"
                  onClick={() => onSelect(g.parent.id)}
                  aria-label={g.parent.name}
                  aria-current={on ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                    on ? 'bg-accent/60' : 'hover:bg-muted/55',
                    !g.parent.is_active && 'opacity-60',
                  )}
                >
                  <CategoryIcon icon={g.parent.icon} color={g.parent.color} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{g.parent.name}</span>
                      {!g.parent.is_active && <Badge variant="outline">Inactive</Badge>}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {matches.length > 0
                        ? `Has ${matches.map((m) => m.name).join(', ')}`
                        : subLabel(g.children.length)}
                    </span>
                  </span>
                  {type === 'expense' && budgets.get(g.parent.id) && (
                    <span className="eyebrow text-[0.625rem]">Budget</span>
                  )}
                  <ChevronRight
                    className={cn('size-4 shrink-0', on ? 'text-foreground' : 'text-muted-foreground/50')}
                  />
                </button>
              </li>
            )
          })}
        </ul>
      </section>
      <GroupDetail
        className="sticky top-24 col-span-7 xl:col-span-8"
        group={selected}
        query={query}
        type={type}
        currency={currency}
        budgets={budgets}
        actions={actions}
      />
    </div>
  )
}

/** One main category in full: its header, its budget, and every sub-category. */
function GroupDetail({
  group,
  query,
  type,
  currency,
  budgets,
  actions,
  className,
}: {
  group: CategoryGroup
  query: string
  type: CategoryType
  currency: string
  budgets: Map<string, Budget>
  actions: Actions
  className?: string
}) {
  const { parent, children } = group
  const budget = type === 'expense' ? budgets.get(parent.id) : undefined
  return (
    <section className={cn('bg-card overflow-hidden rounded-lg border', className)} aria-label={parent.name}>
      <header className="flex items-start gap-4 border-b px-5 py-4">
        <CategoryIcon icon={parent.icon} color={parent.color} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="eyebrow mb-1">Main category · {type}</div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display truncate text-[1.625rem] leading-tight">{parent.name}</h2>
            {!parent.is_active && <Badge variant="outline">Inactive</Badge>}
          </div>
          <p className="text-muted-foreground mt-1 text-[0.8125rem]">
            {subLabel(children.length)}
            {budget && (
              <>
                {' · '}
                <BudgetLink amount={budget.amount} currency={currency} label="Budget for the whole group" />
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => actions.onEdit(parent)}>
            <Pencil data-icon="inline-start" /> Edit
          </Button>
          <RowMenu category={parent} onToggleActive={actions.onToggleActive} />
        </div>
      </header>
      <SubList
        group={group}
        query={query}
        type={type}
        currency={currency}
        budgets={budgets}
        actions={actions}
      />
      <footer className="bg-muted/50 border-t px-5 py-3">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => actions.onAddSub(parent.id)}>
          <Plus data-icon="inline-start" /> Add sub-category
        </Button>
      </footer>
    </section>
  )
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
            <RowMenu category={c} onEdit={actions.onEdit} onToggleActive={actions.onToggleActive} />
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
}: {
  category: Category
  onEdit?: (c: Category) => void
  onToggleActive: (c: Category) => void
  onAddSub?: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-10 lg:size-8"
          aria-label={`Actions for ${c.name}`}
        >
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
