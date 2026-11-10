import { Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowRight, Info, TrendingDown, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { Panel } from '@/components/common/kit'
import { today, type DateRange } from '@/lib/dates'
import { buildInsights, type Insight } from '@/lib/insights'
import { rangeMonth } from '@/lib/dates'
import { useLoans, useReportBudgets, useReportCategories, useSavingsGoals } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { ReportSummary } from '@/types/api'

const ICON = { alert: AlertTriangle, warn: TriangleAlert, good: TrendingDown, info: Info }
const TONE = {
  alert: 'text-destructive',
  warn: 'text-warn',
  good: 'text-income',
  info: 'text-muted-foreground',
}

/**
 * A few plain sentences about the period and what is coming up, each worked
 * out from the user's own figures (see lib/insights). Hidden when there is
 * nothing worth saying.
 */
export function Insights({
  summary,
  range,
  currency,
}: {
  summary?: ReportSummary
  range: DateRange
  currency: string
}) {
  const cur = useReportCategories(range.from, range.to, 'expense')
  const prevRange = summary?.previous ?? { from: range.from, to: range.to }
  const prev = useReportCategories(prevRange.from, prevRange.to, 'expense')
  const budgets = useReportBudgets(rangeMonth(range))
  const loans = useLoans()
  const goals = useSavingsGoals()
  const ready = summary && cur.data && prev.data && budgets.data && loans.data && goals.data
  const items = useMemo<Insight[]>(
    () =>
      ready
        ? buildInsights({
            today: today(),
            currency,
            income: summary.income,
            expenses: summary.expenses,
            previousExpenses: summary.previous.expenses,
            categories: cur.data,
            previousCategories: prev.data,
            budgets: budgets.data,
            loans: loans.data,
            goals: goals.data,
          }).slice(0, 5)
        : [],
    [ready, summary, cur.data, prev.data, budgets.data, loans.data, goals.data, currency],
  )
  if (items.length === 0) return null
  return (
    <Panel eyebrow="From your figures" title="Worth knowing" flush>
      <ul className="divide-rule divide-y">
        {items.map((it) => {
          const Icon = ICON[it.tone]
          const body = (
            <>
              <Icon className={cn('mt-0.5 size-4 shrink-0', TONE[it.tone])} aria-hidden />
              <span className="min-w-0 flex-1 text-sm leading-relaxed">{it.text}</span>
              {it.to && (
                <ArrowRight className="text-muted-foreground/60 mt-0.5 size-4 shrink-0" aria-hidden />
              )}
            </>
          )
          return (
            <li key={it.id}>
              {it.to ? (
                <Link to={it.to} className="hover:bg-muted/55 flex gap-3 px-4 py-3 transition-colors sm:px-5">
                  {body}
                </Link>
              ) : (
                <div className="flex gap-3 px-4 py-3 sm:px-5">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
