import { describe, expect, it } from 'vitest'
import type { ReportCategory } from '@/types/api'
import { rollupCategories } from './reports'

const row = (p: Partial<ReportCategory>): ReportCategory => ({
  category_id: 'x',
  name: 'x',
  icon: 'circle',
  color: '#000',
  parent_id: null,
  parent_name: '',
  amount: 0,
  count: 0,
  pct: 0,
  ...p,
})

describe('rollupCategories', () => {
  it('folds sub-categories into their main category and ranks groups by total', () => {
    const out = rollupCategories([
      row({ category_id: 'rent', name: 'Rent', parent_id: 'home', parent_name: 'Household Expenses', amount: 500, count: 1 }),
      row({ category_id: 'eat', name: 'Eating out', parent_id: 'food', parent_name: 'Food & Groceries', amount: 300, count: 3 }),
      row({ category_id: 'groc', name: 'Groceries', parent_id: 'food', parent_name: 'Food & Groceries', amount: 400, count: 2 }),
      row({ category_id: 'food', name: 'Food & Groceries', amount: 100, count: 1, icon: 'utensils' }),
      row({ category_id: null, name: 'Uncategorised', amount: 50, count: 1 }),
    ])
    expect(out.map((g) => [g.row.name, g.amount, g.count])).toEqual([
      ['Food & Groceries', 800, 6],
      ['Household Expenses', 500, 1],
      ['Uncategorised', 50, 1],
    ])
    // The parent's own spending shows as a "General" child; children are largest first.
    expect(out[0]!.children.map((c) => [c.name, c.amount])).toEqual([
      ['Groceries', 400],
      ['Eating out', 300],
      ['General', 100],
    ])
    expect(out[0]!.row.icon).toBe('utensils')
    expect(out[0]!.row.pct).toBe(59.3)
    expect(out[1]!.children.map((c) => c.name)).toEqual(['Rent'])
  })
})
