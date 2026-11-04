// Recently used categories per transaction kind (localStorage), shown as
// one-tap chips above the category field so repeat entries stay fast.
import type { CategoryType } from '@/types/api'

export const RECENT_CATEGORIES_KEY = 'xpensiv-recent-categories'
export const RECENT_LIMIT = 6

type Store = Partial<Record<CategoryType, string[]>>

function read(): Store {
  try {
    const raw = localStorage.getItem(RECENT_CATEGORIES_KEY)
    return raw ? (JSON.parse(raw) as Store) : {}
  } catch {
    return {}
  }
}

export function getRecentCategories(type: CategoryType): string[] {
  return read()[type] ?? []
}

/** Moves `id` to the front of the list for `type`, keeping at most RECENT_LIMIT. */
export function pushRecentCategory(type: CategoryType, id: string | undefined | null): void {
  if (!id) return
  try {
    const s = read()
    s[type] = [id, ...(s[type] ?? []).filter((x) => x !== id)].slice(0, RECENT_LIMIT)
    localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify(s))
  } catch {
    // storage unavailable - ignore
  }
}

export function clearRecentCategories(): void {
  try {
    localStorage.removeItem(RECENT_CATEGORIES_KEY)
  } catch {
    // nothing to clear
  }
}
