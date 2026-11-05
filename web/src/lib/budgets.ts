// How the budget screens read a month's budgets: what needs attention, what
// is in use and what has not been touched yet.
import type { ReportBudget } from '@/types/api'

export type BudgetGroups = {
  /** Over their limit, worst first. */
  over: ReportBudget[]
  /** Something spent this month (over ones included), highest share first. */
  active: ReportBudget[]
  /** Nothing spent against them yet, in the order the server gave. */
  unused: ReportBudget[]
}

export function groupBudgets(rows: ReportBudget[]): BudgetGroups {
  const active = rows.filter((b) => b.spent > 0).sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name))
  return {
    over: active.filter((b) => b.level === 'over'),
    active,
    unused: rows.filter((b) => b.spent <= 0),
  }
}

export type BudgetTone = 'unused' | 'ok' | 'warn' | 'hot' | 'over'

/** The colour family a budget row uses for its bar and status text. */
export function budgetTone(b: ReportBudget): BudgetTone {
  if (b.spent <= 0) return 'unused'
  switch (b.level) {
    case 'over':
      return 'over'
    case 'warn90':
      return 'hot'
    case 'warn75':
      return 'warn'
    default:
      return 'ok'
  }
}

/**
 * The status words for a budget: what has happened, not a verdict. A budget
 * nobody has spent against is "Nothing spent yet", not "On track".
 */
export function budgetStatus(b: ReportBudget): string {
  if (b.spent <= 0) return 'Nothing spent yet'
  if (b.level === 'over') return 'Over the limit'
  return `${Math.round(b.pct)}% used`
}

/** "2 budgets over limit" / "1 budget over limit". */
export function overLimitLabel(n: number): string {
  return `${n} budget${n === 1 ? '' : 's'} over limit`
}
