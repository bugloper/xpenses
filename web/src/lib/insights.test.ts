import { describe, expect, it } from 'vitest'
import type { Loan, ReportCategory, SavingsGoal } from '@/types/api'
import { buildInsights, goalPace, loansDue, type InsightInput } from './insights'

const cat = (id: string, amount: number): ReportCategory => ({
  category_id: id,
  name: id,
  icon: 'circle',
  color: '#000',
  parent_id: null,
  parent_name: '',
  amount,
  count: 1,
  pct: 0,
})
const loan = (p: Partial<Loan>): Loan => ({
  id: 'l',
  direction: 'given',
  counterparty: 'Pema',
  opening_amount: 0,
  currency: 'BTN',
  start_date: '2026-10-01',
  due_date: null,
  notes: '',
  principal: 10000,
  repaid: 0,
  outstanding: 10000,
  interest: 0,
  transaction_count: 1,
  last_activity: '2026-10-01',
  status: 'open',
  created_at: '',
  updated_at: '',
  ...p,
})
const goal = (p: Partial<SavingsGoal>): SavingsGoal => ({
  id: 'g',
  name: 'Phone',
  target_amount: 60000,
  target_date: null,
  account_id: null,
  notes: '',
  saved: 20000,
  pct: 33.3,
  reached: false,
  created_at: '',
  updated_at: '',
  ...p,
})
const base: InsightInput = {
  today: '2026-11-10',
  currency: 'BTN',
  income: 100000,
  expenses: 40000,
  previousExpenses: 40000,
  categories: [],
  previousCategories: [],
  budgets: [],
  loans: [],
  goals: [],
}
const ids = (i: Partial<InsightInput>) => buildInsights({ ...base, ...i }).map((x) => x.id)

describe('insights', () => {
  it('says nothing when nothing stands out', () => {
    expect(ids({})).toEqual([])
  })

  it('flags overdue and soon-due loans, settled ones never', () => {
    const loans = [
      loan({ id: 'late', due_date: '2026-11-01' }),
      loan({ id: 'soon', due_date: '2026-11-20' }),
      loan({ id: 'later', due_date: '2026-12-31' }),
      loan({ id: 'paid', due_date: '2026-11-01', outstanding: 0 }),
    ]
    expect(loansDue(loans, '2026-11-10')).toMatchObject({ overdue: [{ id: 'late' }], soon: [{ id: 'soon' }] })
    expect(ids({ loans })).toEqual(['overdue-late', 'soon-soon'])
  })

  it('compares spending with the previous period only when the change is worth it', () => {
    expect(ids({ expenses: 43000 })).toEqual([])
    const [up] = buildInsights({ ...base, expenses: 50000 })
    expect(up).toMatchObject({ id: 'spending-change', tone: 'warn' })
    expect(up!.text).toContain('up 25%')
    expect(buildInsights({ ...base, expenses: 30000 })[0]).toMatchObject({ tone: 'good' })
  })

  it('names a category that jumped and one that dominates', () => {
    const got = buildInsights({
      ...base,
      categories: [cat('Rent', 20000), cat('Eating out', 12000), cat('Fuel', 8000)],
      previousCategories: [cat('Rent', 20000), cat('Eating out', 5000), cat('Fuel', 8000)],
    })
    expect(got.map((x) => x.id)).toEqual(['category-jump-Eating out', 'top-category'])
    expect(got[0]!.text).toContain('up 140%')
    expect(got[1]!.text).toContain('Rent took 50%')
  })

  it('works out what a dated goal needs each month', () => {
    expect(goalPace(goal({ target_date: '2027-03-01' }), '2026-11-10')).toEqual({
      perMonth: 10000,
      months: 4,
      late: false,
    })
    expect(goalPace(goal({ target_date: '2026-10-01' }), '2026-11-10')).toMatchObject({
      late: true,
      perMonth: 40000,
    })
    expect(goalPace(goal({}), '2026-11-10')).toBeNull()
    expect(goalPace(goal({ target_date: '2027-03-01', reached: true }), '2026-11-10')).toBeNull()
  })

  it('warns when spending outruns income', () => {
    expect(ids({ income: 30000, expenses: 40000 })).toContain('overspent')
  })
})
