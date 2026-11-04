// Two-level category helpers. A category without a parent is a main
// category ("group"); one with a parent is a sub-category. Transactions may
// be filed under either.
import type { Category, CategoryType } from '@/types/api'

export type CategoryGroup = { parent: Category; children: Category[] }

/**
 * Groups categories of one type under their parent, in sort order. A
 * sub-category whose parent is missing (or filtered out) stands on its own.
 */
export function groupCategories(
  categories: Category[],
  type?: CategoryType,
  opts: { includeInactive?: boolean; keepId?: string } = {},
): CategoryGroup[] {
  const keep = (c: Category) =>
    (!type || c.type === type) && (opts.includeInactive || c.is_active || c.id === opts.keepId)
  const visible = categories.filter(keep).sort(bySort)
  const byId = new Map(visible.map((c) => [c.id, c]))
  const groups = new Map<string, CategoryGroup>()
  for (const c of visible) {
    if (!c.parent_id || !byId.has(c.parent_id)) groups.set(c.id, { parent: c, children: [] })
  }
  for (const c of visible) {
    if (c.parent_id && byId.has(c.parent_id)) {
      const g = groups.get(c.parent_id)
      if (g) g.children.push(c)
      else groups.set(c.id, { parent: c, children: [] })
    }
  }
  return [...groups.values()]
}

function bySort(a: Category, b: Category) {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name)
}

/** The category and, when it is a sub-category, its parent. */
export function categoryPath(
  categories: Category[],
  id: string | null | undefined,
): { category: Category; parent: Category | null } | null {
  if (!id) return null
  const category = categories.find((c) => c.id === id)
  if (!category) return null
  const parent = category.parent_id ? (categories.find((c) => c.id === category.parent_id) ?? null) : null
  return { category, parent }
}

/** "Parent › Sub" for a sub-category, else just the name. */
export function categoryLabel(categories: Category[], id: string | null | undefined): string {
  const p = categoryPath(categories, id)
  if (!p) return ''
  return p.parent ? `${p.parent.name} › ${p.category.name}` : p.category.name
}

export type CategoryMatch = { category: Category; parent: Category | null }

/** Case-insensitive search across groups and sub-categories, best matches first. */
export function searchCategories(groups: CategoryGroup[], query: string): CategoryMatch[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: Array<CategoryMatch & { rank: number }> = []
  const rank = (name: string, parent?: string) => {
    const n = name.toLowerCase()
    if (n.startsWith(q)) return 0
    if (n.includes(q)) return 1
    if (parent && parent.toLowerCase().includes(q)) return 2
    return -1
  }
  for (const g of groups) {
    const r = rank(g.parent.name)
    if (r >= 0) out.push({ category: g.parent, parent: null, rank: r })
    for (const c of g.children) {
      const rc = rank(c.name, g.parent.name)
      if (rc >= 0) out.push({ category: c, parent: g.parent, rank: rc })
    }
  }
  return out.sort((a, b) => a.rank - b.rank).map(({ rank: _r, ...m }) => m)
}
