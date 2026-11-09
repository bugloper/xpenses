import { Check, ChevronDown, ChevronRight, Plus, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CategoryFormSheet } from '@/components/categories/CategoryForm'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { groupCategories, searchCategories, type CategoryGroup } from '@/lib/categories'
import { cn } from '@/lib/utils'
import type { Category, CategoryType } from '@/types/api'

/**
 * Full category chooser: a search box and the main categories as an
 * accordion, each opening to its sub-categories. Keeps the form itself
 * uncluttered; see CategoryField for the compact control that opens it.
 */
export function CategoryPicker({
  open,
  onOpenChange,
  categories,
  type,
  value,
  onSelect,
  allowCreate = true,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  categories: Category[]
  type: CategoryType
  value?: string
  onSelect: (id: string) => void
  allowCreate?: boolean
}) {
  const [create, setCreate] = useState<{ parentId: string | null } | null>(null)
  const choose = (id: string) => {
    onSelect(id)
    onOpenChange(false)
  }

  return (
    <>
      <ResponsiveSheet
        open={open}
        onOpenChange={onOpenChange}
        title="Choose a category"
        className="sm:max-w-lg data-[side=right]:sm:max-w-lg"
        footer={
          allowCreate ? (
            <Button variant="outline" className="w-full" onClick={() => setCreate({ parentId: null })}>
              <Plus data-icon="inline-start" /> New main category
            </Button>
          ) : undefined
        }
      >
        <PickerBody
          categories={categories}
          type={type}
          value={value}
          onChoose={choose}
          onCreate={allowCreate ? (parentId) => setCreate({ parentId }) : undefined}
        />
      </ResponsiveSheet>
      {allowCreate && (
        <CategoryFormSheet
          open={create !== null}
          onOpenChange={(o) => !o && setCreate(null)}
          defaultType={type}
          defaultParentId={create?.parentId ?? null}
          lockType
          onCreated={(c) => choose(c.id)}
        />
      )}
    </>
  )
}

/** Sheet body; mounted only while the sheet is open, so its state resets each time. */
function PickerBody({
  categories,
  type,
  value,
  onChoose,
  onCreate,
}: {
  categories: Category[]
  type: CategoryType
  value?: string
  onChoose: (id: string) => void
  onCreate?: (parentId: string | null) => void
}) {
  const groups = useMemo(
    () => groupCategories(categories, type, { keepId: value }),
    [categories, type, value],
  )
  const [query, setQuery] = useState('')
  // Start on the group holding the current choice.
  const [expanded, setExpanded] = useState<string | null>(() => {
    const current = categories.find((c) => c.id === value)
    return current ? (current.parent_id ?? current.id) : null
  })
  const matches = useMemo(() => searchCategories(groups, query), [groups, query])
  const choose = onChoose

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          aria-label="Search categories"
          placeholder="Search categories"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pr-9 pl-9"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery('')}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 p-1"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {query.trim() ? (
        matches.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No category matches “{query.trim()}”.
          </p>
        ) : (
          <div
            role="radiogroup"
            aria-label="Matching categories"
            className="divide-rule divide-y rounded-md border"
          >
            {matches.map((m) => (
              <button
                key={m.category.id}
                type="button"
                role="radio"
                aria-checked={m.category.id === value}
                onClick={() => choose(m.category.id)}
                className={cn(
                  'flex min-h-12 items-center gap-3 px-3 py-2 text-left transition-colors first:rounded-t-[5px] last:rounded-b-[5px]',
                  m.category.id === value ? 'bg-saffron-soft/50' : 'hover:bg-muted/60',
                )}
              >
                <CategoryIcon icon={m.category.icon} color={m.category.color} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.category.name}</span>
                  {m.parent && (
                    <span className="text-muted-foreground block truncate text-xs">{m.parent.name}</span>
                  )}
                </span>
                {m.category.id === value && <Check className="text-accent-foreground size-4 shrink-0" />}
              </button>
            ))}
          </div>
        )
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">No {type} categories yet.</p>
      ) : (
        <ul className="divide-rule divide-y rounded-md border" aria-label="Main categories">
          {groups.map((g) => (
            <GroupRow
              key={g.parent.id}
              group={g}
              value={value}
              expanded={expanded === g.parent.id}
              onToggle={() => setExpanded((e) => (e === g.parent.id ? null : g.parent.id))}
              onChoose={choose}
              onAdd={onCreate ? () => onCreate(g.parent.id) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function GroupRow({
  group,
  value,
  expanded,
  onToggle,
  onChoose,
  onAdd,
}: {
  group: CategoryGroup
  value?: string
  expanded: boolean
  onToggle: () => void
  onChoose: (id: string) => void
  onAdd?: () => void
}) {
  const { parent, children } = group
  const selectedInside = value === parent.id || children.some((c) => c.id === value)
  if (children.length === 0) {
    // A main category with no sub-categories is picked directly.
    return (
      <li>
        <button
          type="button"
          role="radio"
          aria-checked={value === parent.id}
          onClick={() => onChoose(parent.id)}
          className={cn(
            'flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors',
            value === parent.id ? 'bg-saffron-soft/50' : 'hover:bg-muted/60',
          )}
        >
          <CategoryIcon icon={parent.icon} color={parent.color} size="sm" />
          <span className="flex-1 truncate text-sm font-medium">{parent.name}</span>
          {value === parent.id && <Check className="text-accent-foreground size-4 shrink-0" />}
          {onAdd && (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Add sub-category to ${parent.name}`}
              onClick={(e) => {
                e.stopPropagation()
                onAdd()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  onAdd()
                }
              }}
              className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-8 items-center justify-center rounded-md"
            >
              <Plus className="size-4" />
            </span>
          )}
        </button>
      </li>
    )
  }
  return (
    <li className={cn(expanded && 'bg-muted/45')}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="hover:bg-muted/60 flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors"
      >
        <CategoryIcon icon={parent.icon} color={parent.color} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{parent.name}</span>
          {selectedInside && !expanded && (
            <span className="text-accent-foreground block truncate text-xs">
              {children.find((c) => c.id === value)?.name ?? 'General'}
            </span>
          )}
        </span>
        <span className="text-muted-foreground font-mono text-[0.6875rem]" aria-hidden>
          {children.length}
        </span>
        {expanded ? (
          <ChevronDown className="text-muted-foreground size-4" />
        ) : (
          <ChevronRight className="text-muted-foreground size-4" />
        )}
      </button>
      {expanded && (
        <div
          role="radiogroup"
          aria-label={`${parent.name} sub-categories`}
          className="grid grid-cols-3 gap-1.5 px-3 pt-0.5 pb-3 sm:grid-cols-4"
        >
          <Chip
            icon={parent.icon}
            color={parent.color}
            label="General"
            ariaLabel={`${parent.name} (general)`}
            active={value === parent.id}
            onClick={() => onChoose(parent.id)}
          />
          {children.map((c) => (
            <Chip
              key={c.id}
              icon={c.icon}
              color={c.color}
              label={c.name}
              active={value === c.id}
              onClick={() => onChoose(c.id)}
            />
          ))}
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              aria-label={`Add sub-category to ${parent.name}`}
              className="hover:bg-card text-muted-foreground hover:text-foreground flex min-h-[4.75rem] flex-col items-center justify-center gap-1.5 rounded-md border border-dashed p-2 text-center text-[11px] font-medium transition-colors"
            >
              <Plus className="size-5" />
              Add
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function Chip({
  icon,
  color,
  label,
  ariaLabel,
  active,
  onClick,
}: {
  icon: string
  color: string
  label: string
  ariaLabel?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'bg-card flex min-h-[4.75rem] flex-col items-center gap-1.5 rounded-md border p-2 text-center transition-colors',
        active ? 'border-saffron ring-saffron/40 ring-1' : 'hover:border-foreground/30',
      )}
    >
      <CategoryIcon icon={icon} color={color} size="sm" />
      <span className="line-clamp-2 text-[11px] leading-tight font-medium">{label}</span>
    </button>
  )
}
