import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ErrorState, EmptyState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import { formatPeriodTick, isISODate, today } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import type { ReportCashFlow } from '@/types/api'

function compact(minor: number): string {
  const whole = Math.trunc(Math.abs(minor) / 100)
  if (whole >= 1_000_000) return `${Math.round(whole / 100_000) / 10}M`
  if (whole >= 1_000) return `${Math.round(whole / 100) / 10}k`
  return String(whole)
}

/** Each period's income and expenses added to everything before it. */
function runningTotals(rows: ReportCashFlow[]): ReportCashFlow[] {
  const out: ReportCashFlow[] = []
  for (const r of rows) {
    const prev = out[out.length - 1]
    const income = (prev?.income ?? 0) + r.income
    const expenses = (prev?.expenses ?? 0) + r.expenses
    out.push({ period: r.period, income, expenses, net: income - expenses })
  }
  return out
}

// The ledger palette: received is pine, spent is vermilion, the axes are mono.
const INCOME = 'var(--paid)'
const EXPENSE = 'var(--owed)'
const TICK = { fill: 'var(--muted-foreground)', fontSize: 10, fontFamily: 'var(--font-mono)' }
const TOOLTIP = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 12,
  color: 'var(--popover-foreground)',
  boxShadow: '0 4px 14px -6px rgb(0 0 0 / 0.18)',
}
const LABEL = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--muted-foreground)',
  marginBottom: 2,
}

/**
 * Income and spending over time (transfers and loans are neither). `running` draws the period's running totals
 * (a day's salary no longer dwarfs every other day) and stops at today;
 * otherwise each period is a pair of bars.
 */
export function CashFlowChart({
  data,
  loading,
  error,
  onRetry,
  currency,
  running = false,
}: {
  data?: ReportCashFlow[]
  loading: boolean
  error: unknown
  onRetry: () => void
  currency: string
  running?: boolean
}) {
  if (loading && !data) return <Skeleton className="h-60 w-full rounded-md sm:h-64" />
  if (error && !data) return <ErrorState error={error} onRetry={onRetry} compact />
  const rows = data ?? []
  if (rows.length === 0 || rows.every((r) => r.income === 0 && r.expenses === 0))
    return (
      <EmptyState
        title="No activity yet"
        description="Income and expenses will show up here."
        className="py-8"
      />
    )

  const formatter = (value: unknown, name: unknown) =>
    [formatMoney(Number(value), currency), name === 'income' ? 'Income' : 'Spending'] as [string, string]

  if (running) {
    const now = today()
    const points = runningTotals(rows.filter((r) => !isISODate(r.period) || r.period <= now))
    return (
      <div className="h-60 w-full sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--rule)" />
            <XAxis
              dataKey="period"
              tickFormatter={formatPeriodTick}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              tick={TICK}
              interval="preserveStartEnd"
              minTickGap={14}
            />
            <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={40} tick={TICK} />
            <Tooltip
              cursor={{ stroke: 'var(--border)' }}
              contentStyle={TOOLTIP}
              labelStyle={LABEL}
              formatter={formatter}
              labelFormatter={(label) => `To ${String(label)}`}
            />
            <Area
              type="monotone"
              dataKey="income"
              name="income"
              stroke={INCOME}
              strokeWidth={2}
              fill={INCOME}
              fillOpacity={0.04}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="expenses"
              name="expenses"
              stroke={EXPENSE}
              strokeWidth={2}
              fill={EXPENSE}
              fillOpacity={0.07}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return (
    <div className="h-60 w-full sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
          barGap={2}
          barCategoryGap="30%"
        >
          <CartesianGrid vertical={false} stroke="var(--rule)" />
          <XAxis
            dataKey="period"
            tickFormatter={formatPeriodTick}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tick={TICK}
            interval="preserveStartEnd"
          />
          <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={40} tick={TICK} />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
            contentStyle={TOOLTIP}
            labelStyle={LABEL}
            formatter={formatter}
            labelFormatter={(label) => String(label)}
          />
          <Bar
            dataKey="income"
            name="income"
            fill={INCOME}
            radius={[2, 2, 0, 0]}
            maxBarSize={22}
            isAnimationActive={false}
          />
          <Bar
            dataKey="expenses"
            name="expenses"
            fill={EXPENSE}
            radius={[2, 2, 0, 0]}
            maxBarSize={22}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
