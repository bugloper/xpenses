// Recharts-backed pieces for the Reports screen. Loaded lazily so the chart
// library only ships when a chart is on screen.
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Money } from '@/components/common/Money'
import { formatPeriodTick } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import type { ReportCashFlow, ReportCategory } from '@/types/api'

const TOOLTIP_STYLE = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  fontSize: 12,
  color: 'var(--popover-foreground)',
}

function compact(minor: number): string {
  const whole = Math.trunc(Math.abs(minor) / 100)
  if (whole >= 1_000_000) return `${Math.round(whole / 100_000) / 10}M`
  if (whole >= 1_000) return `${Math.round(whole / 100) / 10}k`
  return String(whole)
}

export function CategoryDonutChart({
  rows,
  total,
  currency,
  label,
  activeId,
}: {
  rows: ReportCategory[]
  total: number
  currency: string
  label: string
  activeId?: string | null
}) {
  return (
    <div className="relative mx-auto h-52 w-52 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="amount" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="none">
            {rows.map((r, i) => (
              <Cell
                key={`${r.category_id ?? 'none'}-${i}`}
                fill={r.color || '#64748b'}
                opacity={activeId && (r.category_id ?? 'none') !== activeId ? 0.35 : 1}
              />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [formatMoney(Number(value), currency), String(name)]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-muted-foreground text-[11px]">{label}</span>
        <Money minor={total} currency={currency} className="text-sm font-semibold" />
      </div>
    </div>
  )
}

/** Expenses-only bars (daily / weekly spending) with an average line. */
export function SpendingBars({ rows, average, currency }: { rows: ReportCashFlow[]; average: number; currency: string }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="25%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="period" tickFormatter={formatPeriodTick} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={40} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => [formatMoney(Number(value), currency), 'Spent']}
            labelFormatter={(label) => String(label)}
          />
          {average > 0 && <ReferenceLine y={average} stroke="var(--muted-foreground)" strokeDasharray="4 4" />}
          <Bar dataKey="expenses" name="expenses" radius={[6, 6, 0, 0]} maxBarSize={32}>
            {rows.map((r) => (
              <Cell key={r.period} fill={r.expenses > average && average > 0 ? 'var(--expense)' : 'var(--chart-1)'} opacity={r.expenses === 0 ? 0.3 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
