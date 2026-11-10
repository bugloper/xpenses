import { describe, expect, it } from 'vitest'
import type { ReportCategory } from '@/types/api'
import { refundsBeyondSpending, rollupCategories } from './reports'

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

describe('refunds beyond spending', () => {
  const row = (id: string, amount: number, parent: string | null = null) => ({
    category_id: id,
    name: id,
    icon: 'circle',
    color: '#000',
    parent_id: parent,
    parent_name: parent ?? '',
    amount,
    count: 1,
    pct: 0,
  })
  it('nets refunds into the main category and sets aside what is left', () => {
    const rows = [
      row('rent', 1000),
      row('groceries', -450, 'food'),
      row('eating-out', 300, 'food'),
      row('fuel', -200),
    ]
    const groups = rollupCategories(rows)
    expect(groups.map((g) => [g.row.name, g.amount])).toEqual([['rent', 1000]])
    expect(refundsBeyondSpending(rows)).toBe(-350)
    // Ranked plus refunds is the period's spending.
    expect(groups.reduce((n, g) => n + g.amount, 0) + refundsBeyondSpending(rows)).toBe(650)
  })
})
