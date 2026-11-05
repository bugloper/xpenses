import { describe, expect, it } from 'vitest'
import type { ReportBudget } from '@/types/api'
import { budgetStatus, budgetTone, groupBudgets, overLimitLabel } from './budgets'

const row = (p: Partial<ReportBudget>): ReportBudget => ({
  budget_id: p.name ?? 'b',
  category_id: 'c',
  name: 'Budget',
  icon: 'circle',
  color: '#000',
  amount: 10000,
  spent: 0,
  remaining: 10000,
  pct: 0,
  level: 'ok',
  ...p,
})

describe('groupBudgets', () => {
  it('separates untouched budgets and ranks the rest by share, over-limit first', () => {
    const rows = [
      row({ name: 'Fuel' }),
      row({ name: 'Food', spent: 12000, remaining: -2000, pct: 120, level: 'over' }),
      row({ name: 'Rent', spent: 5000, remaining: 5000, pct: 50 }),
      row({ name: 'Fun', spent: 50000, remaining: -40000, pct: 500, level: 'over' }),
    ]
    const g = groupBudgets(rows)
    expect(g.unused.map((b) => b.name)).toEqual(['Fuel'])
    expect(g.active.map((b) => b.name)).toEqual(['Fun', 'Food', 'Rent'])
    expect(g.over.map((b) => b.name)).toEqual(['Fun', 'Food'])
  })
})

describe('budgetStatus', () => {
  it('describes what happened rather than passing judgement', () => {
    expect(budgetStatus(row({}))).toBe('Nothing spent yet')
    expect(budgetStatus(row({ spent: 6000, pct: 60 }))).toBe('60% used')
    expect(budgetStatus(row({ spent: 9500, pct: 95, level: 'warn90' }))).toBe('95% used')
    expect(budgetStatus(row({ spent: 15000, pct: 150, level: 'over' }))).toBe('Over the limit')
  })
  it('tones follow the level, except that nothing spent is its own tone', () => {
    expect(budgetTone(row({}))).toBe('unused')
    expect(budgetTone(row({ spent: 1, level: 'warn75' }))).toBe('warn')
    expect(budgetTone(row({ spent: 1, level: 'warn90' }))).toBe('hot')
    expect(budgetTone(row({ spent: 1, level: 'over' }))).toBe('over')
  })
  it('pluralises the attention heading', () => {
    expect(overLimitLabel(1)).toBe('1 budget over limit')
    expect(overLimitLabel(2)).toBe('2 budgets over limit')
  })
})
