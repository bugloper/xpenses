import { describe, expect, it } from 'vitest'
import type { Category } from '@/types/api'
import { categoryLabel, categoryPath, groupCategories, searchCategories } from './categories'

const cat = (id: string, name: string, parent_id: string | null = null, extra: Partial<Category> = {}): Category => ({
  id,
  name,
  icon: 'circle',
  color: '#000000',
  type: 'expense',
  parent_id,
  is_active: true,
  is_system: true,
  sort_order: 0,
  created_at: '',
  updated_at: '',
  ...extra,
})

const cats: Category[] = [
  cat('food', 'Food & Groceries', null, { sort_order: 200 }),
  cat('eat', 'Eating out', 'food', { sort_order: 204 }),
  cat('groc', 'Groceries', 'food', { sort_order: 201 }),
  cat('home', 'Household Expenses', null, { sort_order: 100 }),
  cat('rent', 'Rent', 'home', { sort_order: 101 }),
  cat('old', 'Old habit', 'home', { sort_order: 102, is_active: false }),
  cat('momo', 'Momo', null, { sort_order: 9999, is_system: false }),
  cat('salary', 'Salary', 'emp', { type: 'income' }),
  cat('emp', 'Employment', null, { type: 'income' }),
]

describe('groupCategories', () => {
  it('nests sub-categories under their parent in sort order, per type', () => {
    const g = groupCategories(cats, 'expense')
    expect(g.map((x) => x.parent.name)).toEqual(['Household Expenses', 'Food & Groceries', 'Momo'])
    expect(g[1]!.children.map((c) => c.name)).toEqual(['Groceries', 'Eating out'])
    expect(groupCategories(cats, 'income')[0]!.children[0]!.name).toBe('Salary')
  })
  it('hides inactive categories unless asked, but always keeps the current choice', () => {
    expect(groupCategories(cats, 'expense')[0]!.children.map((c) => c.name)).toEqual(['Rent'])
    expect(groupCategories(cats, 'expense', { includeInactive: true })[0]!.children).toHaveLength(2)
    expect(groupCategories(cats, 'expense', { keepId: 'old' })[0]!.children).toHaveLength(2)
  })
  it('lets an orphaned sub-category stand on its own', () => {
    const g = groupCategories([cat('x', 'Orphan', 'gone')], 'expense')
    expect(g).toHaveLength(1)
    expect(g[0]!.parent.name).toBe('Orphan')
  })
})

describe('categoryPath / categoryLabel', () => {
  it('resolves the parent and renders Group › Sub', () => {
    expect(categoryPath(cats, 'eat')?.parent?.name).toBe('Food & Groceries')
    expect(categoryLabel(cats, 'eat')).toBe('Food & Groceries › Eating out')
    expect(categoryLabel(cats, 'momo')).toBe('Momo')
    expect(categoryLabel(cats, 'nope')).toBe('')
    expect(categoryPath(cats, undefined)).toBeNull()
  })
})

describe('searchCategories', () => {
  const groups = groupCategories(cats, 'expense')
  it('matches names case-insensitively, prefix matches first, and finds subs by their group', () => {
    expect(searchCategories(groups, 'gro').map((m) => m.category.name)).toEqual(['Groceries', 'Food & Groceries', 'Eating out'])
    const byGroup = searchCategories(groups, 'household').map((m) => m.category.name)
    expect(byGroup).toEqual(['Household Expenses', 'Rent'])
    expect(searchCategories(groups, '')).toEqual([])
    expect(searchCategories(groups, 'zzz')).toEqual([])
  })
})
