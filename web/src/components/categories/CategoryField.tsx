import { ChevronsUpDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CategoryPicker } from '@/components/categories/CategoryPicker'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { categoryPath } from '@/lib/categories'
import { getRecentCategories } from '@/lib/recent-categories'
import { cn } from '@/lib/utils'
import type { Category, CategoryType } from '@/types/api'

/**
 * Compact category control: one button showing the choice ("Group › Sub")
 * that opens the full picker, plus one-tap chips for recently used
 * categories so repeat entries stay fast.
 */
export function CategoryField({
  id,
  categories,
  type,
  value,
  onChange,
  invalid,
  allowCreate = true,
  showRecent = true,
}: {
  id?: string
  categories: Category[]
  type: CategoryType
  value?: string
  onChange: (id: string | undefined) => void
  invalid?: boolean
  allowCreate?: boolean
  showRecent?: boolean
}) {
  const [open, setOpen] = useState(false)
  const path = categoryPath(categories, value)
  const recent = useMemo(() => {
    if (!showRecent) return []
    return getRecentCategories(type)
      .map((rid) => categories.find((c) => c.id === rid))
      .filter((c): c is Category => !!c && c.type === type && c.is_active)
  }, [categories, type, showRecent, open, value]) // eslint-disable-line react-hooks/exhaustive-deps -- re-read storage after a pick

  return (
    <div className="flex flex-col gap-2">
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid}
        onClick={() => setOpen(true)}
        className={cn(
          'bg-card hover:border-foreground/30 flex h-12 w-full items-center gap-3 rounded-md border px-2.5 text-left transition-colors',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none',
          invalid ? 'border-destructive' : 'border-input',
        )}
      >
        {path ? (
          <>
            <CategoryIcon icon={path.category.icon} color={path.category.color} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{path.category.name}</span>
              {path.parent && (
                <span className="text-muted-foreground block truncate text-xs">{path.parent.name}</span>
              )}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground flex-1 px-0.5 text-sm">Choose a category</span>
        )}
        <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
      </button>
      {recent.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="eyebrow shrink-0">Recent</span>
          <div
            role="radiogroup"
            aria-label="Recent categories"
            className="no-scrollbar -mr-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5 pr-1"
          >
            {recent.map((c) => {
              const active = c.id === value
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange(active ? undefined : c.id)}
                  className={cn(
                    'flex h-8 shrink-0 items-center gap-1.5 rounded-md border pr-2.5 pl-1 text-xs font-medium transition-colors',
                    active
                      ? 'border-foreground bg-foreground text-background'
                      : 'bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30',
                  )}
                >
                  <CategoryIcon
                    icon={c.icon}
                    color={c.color}
                    size="sm"
                    className="size-6 rounded-sm [&>svg]:size-3.5"
                  />
                  {c.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <CategoryPicker
        open={open}
        onOpenChange={setOpen}
        categories={categories}
        type={type}
        value={value}
        onSelect={(cid) => onChange(cid)}
        allowCreate={allowCreate}
      />
    </div>
  )
}
