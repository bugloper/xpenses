import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorState, EmptyState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import { formatPeriodTick } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import type { ReportCashFlow } from '@/types/api'

function compact(minor: number): string {
  const whole = Math.trunc(Math.abs(minor) / 100)
  if (whole >= 1_000_000) return `${Math.round(whole / 100_000) / 10}M`
  if (whole >= 1_000) return `${Math.round(whole / 100) / 10}k`
  return String(whole)
}

export function CashFlowChart({
  data,
  loading,
  error,
  onRetry,
  currency,
}: {
  data?: ReportCashFlow[]
  loading: boolean
  error: unknown
  onRetry: () => void
  currency: string
}) {
  if (loading && !data) return <Skeleton className="h-56 w-full rounded-xl" />
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
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
          barGap={2}
          barCategoryGap="30%"
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="period"
            tickFormatter={formatPeriodTick}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={compact}
            tickLine={false}
            axisLine={false}
            width={40}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              fontSize: 12,
              color: 'var(--popover-foreground)',
            }}
            formatter={(value, name) => [
              formatMoney(Number(value), currency),
              name === 'income' ? 'Income' : 'Expenses',
            ]}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey="income" name="income" fill="var(--income)" radius={[6, 6, 0, 0]} maxBarSize={28} />
          <Bar
            dataKey="expenses"
            name="expenses"
            fill="var(--expense)"
            radius={[6, 6, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
