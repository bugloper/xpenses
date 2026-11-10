// Financial insights for the dashboard, worked out from the user's own data.
// Every rule here states a fact the numbers support; nothing is guessed, and
// a rule that has nothing worth saying says nothing.
import { differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns'
import { formatShortDate, parseISODate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { rollupCategories } from '@/lib/reports'
import type { Loan, ReportBudget, ReportCategory, SavingsGoal } from '@/types/api'

export type Insight = {
  id: string
  tone: 'alert' | 'warn' | 'good' | 'info'
  text: string
  /** Where to look closer. */
  to?: string
}

export type InsightInput = {
  today: string
  currency: string
  /** The period's income and spending, and the previous period's spending. */
  income: number
  expenses: number
  previousExpenses: number
  /** Spending by category in the period and in the one before. */
  categories: ReportCategory[]
  previousCategories: ReportCategory[]
  /** Budgets of the month the period ends in. */
  budgets: ReportBudget[]
  loans: Loan[]
  goals: SavingsGoal[]
}

/** Loans with something owed that were due before today, or fall due within this many days. */
export const DUE_SOON_DAYS = 14

const pct = (part: number, whole: number) => Math.round((part * 100) / whole)

export function loansDue(loans: Loan[], today: string) {
  const t = parseISODate(today)!
  const open = loans.filter((l) => l.outstanding > 0 && l.due_date)
  const days = (l: Loan) => differenceInCalendarDays(parseISODate(l.due_date!)!, t)
  return {
    overdue: open.filter((l) => days(l) < 0).sort((a, b) => days(a) - days(b)),
    soon: open.filter((l) => days(l) >= 0 && days(l) <= DUE_SOON_DAYS).sort((a, b) => days(a) - days(b)),
  }
}

/** What a goal with a date needs each month from now to make it; null without a date or once reached. */
export function goalPace(
  goal: SavingsGoal,
  today: string,
): { perMonth: number; months: number; late: boolean } | null {
  if (!goal.target_date || goal.reached) return null
  const left = goal.target_amount - goal.saved
  const t = parseISODate(today)!
  const target = parseISODate(goal.target_date)!
  if (target < t) return { perMonth: left, months: 0, late: true }
  // The month the target falls in counts: saving by 1 March leaves March's own days too.
  const months = Math.max(1, differenceInCalendarMonths(target, t) + (target.getDate() > t.getDate() ? 1 : 0))
  return { perMonth: Math.ceil(left / months), months, late: false }
}

export function buildInsights(i: InsightInput): Insight[] {
  const out: Insight[] = []
  const money = (v: number) => formatMoney(v, i.currency)

  // Loans that are late or nearly due: the only things with a deadline.
  const { overdue, soon } = loansDue(i.loans, i.today)
  for (const l of overdue.slice(0, 2)) {
    out.push({
      id: `overdue-${l.id}`,
      tone: 'alert',
      text:
        l.direction === 'received'
          ? `Your loan from ${l.counterparty} was due ${formatShortDate(l.due_date!)}: ${money(l.outstanding)} still to repay.`
          : `${l.counterparty} was to repay you by ${formatShortDate(l.due_date!)}: ${money(l.outstanding)} still owed.`,
      to: `/loans/${l.id}`,
    })
  }
  for (const l of soon.slice(0, 2)) {
    out.push({
      id: `soon-${l.id}`,
      tone: 'warn',
      text:
        l.direction === 'received'
          ? `${money(l.outstanding)} to repay ${l.counterparty} by ${formatShortDate(l.due_date!)}.`
          : `${l.counterparty} is due to repay ${money(l.outstanding)} by ${formatShortDate(l.due_date!)}.`,
      to: `/loans/${l.id}`,
    })
  }

  const over = i.budgets.filter((b) => b.level === 'over')
  if (over.length > 0) {
    out.push({
      id: 'budgets-over',
      tone: 'alert',
      text:
        over.length === 1
          ? `${over[0]!.name} is ${money(over[0]!.spent - over[0]!.amount)} over its budget this month.`
          : `${over.length} budgets are over their limit this month.`,
      to: '/budgets',
    })
  }

  if (i.expenses > 0 && i.expenses > i.income && i.income > 0) {
    out.push({
      id: 'overspent',
      tone: 'warn',
      text: `You spent ${money(i.expenses - i.income)} more than you earned in this period.`,
    })
  }

  // Spending against the period before, when the change is worth a mention.
  if (i.previousExpenses > 0 && i.expenses > 0) {
    const change = pct(i.expenses - i.previousExpenses, i.previousExpenses)
    if (Math.abs(change) >= 10) {
      out.push({
        id: 'spending-change',
        tone: change > 0 ? 'warn' : 'good',
        text:
          change > 0
            ? `Spending is up ${change}% on the previous period (${money(i.expenses)} against ${money(i.previousExpenses)}).`
            : `Spending is down ${-change}% on the previous period (${money(i.expenses)} against ${money(i.previousExpenses)}).`,
        to: '/reports?tab=spending',
      })
    }
  }

  // The category that grew the most, if it grew by half and matters to the total.
  const cur = rollupCategories(i.categories)
  const prev = new Map(
    rollupCategories(i.previousCategories).map((g) => [g.row.category_id ?? 'none', g.amount]),
  )
  const total = cur.reduce((n, g) => n + g.amount, 0)
  const jumps = cur
    .map((g) => ({ g, before: prev.get(g.row.category_id ?? 'none') ?? 0 }))
    .filter(({ g, before }) => before > 0 && g.amount >= before * 1.5 && g.amount - before >= total * 0.1)
    .sort((a, b) => b.g.amount - b.before - (a.g.amount - a.before))
  const jump = jumps[0]
  if (jump) {
    out.push({
      id: `category-jump-${jump.g.row.category_id ?? 'none'}`,
      tone: 'warn',
      text: `${jump.g.row.name} rose to ${money(jump.g.amount)}, up ${pct(jump.g.amount - jump.before, jump.before)}% on the previous period.`,
      to: '/reports?tab=spending',
    })
  }
  const top = cur[0]
  if (top && total > 0 && cur.length > 1 && top.amount * 100 >= total * 30 && top !== jump?.g) {
    out.push({
      id: 'top-category',
      tone: 'info',
      text: `${top.row.name} took ${pct(top.amount, total)}% of your spending (${money(top.amount)}).`,
      to: '/reports?tab=spending',
    })
  }

  // The goal that needs the most each month to make its date.
  const paced = i.goals
    .map((g) => ({ g, pace: goalPace(g, i.today) }))
    .filter((x): x is { g: SavingsGoal; pace: NonNullable<ReturnType<typeof goalPace>> } => !!x.pace)
    .sort((a, b) => Number(b.pace.late) - Number(a.pace.late) || b.pace.perMonth - a.pace.perMonth)
  const goal = paced[0]
  if (goal) {
    out.push({
      id: `goal-${goal.g.id}`,
      tone: goal.pace.late ? 'warn' : 'info',
      text: goal.pace.late
        ? `${goal.g.name} passed its date with ${money(goal.pace.perMonth)} still to save.`
        : `${goal.g.name}: put aside ${money(goal.pace.perMonth)} a month to reach ${money(goal.g.target_amount)} by ${formatShortDate(goal.g.target_date!)}.`,
      to: '/savings',
    })
  }
  return out
}
