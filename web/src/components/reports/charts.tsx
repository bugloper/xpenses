// Recharts-backed pieces for the Reports screen, all drawn in one style: ink
// on paper, hairline gridlines, mono ticks, received in pine and spent in
// vermilion. Loaded lazily so the chart library only ships when a chart is on
// screen.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatPeriodTick } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import type { ReportCashFlow } from '@/types/api'
import { periodLong } from './format'

/** The report palette: CSS variables, so both themes follow the tokens. */
export const SERIES = {
  income: 'var(--paid)',
  expense: 'var(--owed)',
  grid: 'var(--rule)',
  axis: 'var(--border)',
  tick: 'var(--muted-foreground)',
  cursor: 'var(--muted)',
} as const

const TICK = { fill: SERIES.tick, fontSize: 10.5, fontFamily: 'var(--font-mono)' }
const MARGIN = { top: 12, right: 4, left: 0, bottom: 0 }

function compact(minor: number): string {
  const whole = Math.trunc(Math.abs(minor) / 100)
  if (whole >= 1_000_000) return `${Math.round(whole / 100_000) / 10}M`
  if (whole >= 1_000) return `${Math.round(whole / 100) / 10}k`
  return String(whole)
}

type TipRow = { key: string; label: string; value: number; color: string }

/** The tooltip card: a dated slip with one ruled line per series. */
function Slip({
  title,
  rows,
  currency,
  foot,
}: {
  title: string
  rows: TipRow[]
  currency: string
  foot?: string
}) {
  return (
    <div className="bg-popover text-popover-foreground min-w-44 rounded-md border px-3 py-2.5 shadow-[0_6px_20px_-8px_rgb(0_0_0/0.25)]">
      <div className="eyebrow text-foreground/70 mb-1.5">{title}</div>
      <div className="divide-rule divide-y">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-4 py-1 text-[0.8125rem]">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-[2px]" style={{ background: r.color }} />
              {r.label}
            </span>
            <span className="tabular font-medium">{formatMoney(r.value, currency)}</span>
          </div>
        ))}
      </div>
      {foot && <div className="text-muted-foreground mt-1.5 text-[0.75rem]">{foot}</div>}
    </div>
  )
}

type TipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }>; label?: string | number }

function rowOf(p: TipProps): ReportCashFlow | null {
  if (!p.active || !p.payload?.length) return null
  return (p.payload[0]?.payload as ReportCashFlow | undefined) ?? null
}

/** Income and expenses side by side for each period. */
export function CashFlowBars({
  rows,
  currency,
  height = 260,
}: {
  rows: ReportCashFlow[]
  currency: string
  height?: number
}) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={MARGIN} barGap={1} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={SERIES.grid} />
          <XAxis
            dataKey="period"
            tickFormatter={formatPeriodTick}
            tickLine={false}
            axisLine={{ stroke: SERIES.axis }}
            tick={TICK}
            tickMargin={6}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={40} tick={TICK} />
          <Tooltip
            cursor={{ fill: SERIES.cursor, opacity: 0.6 }}
            content={(p: TipProps) => {
              const r = rowOf(p)
              if (!r) return null
              return (
                <Slip
                  title={periodLong(r.period)}
                  currency={currency}
                  rows={[
                    { key: 'in', label: 'Income', value: r.income, color: SERIES.income },
                    { key: 'out', label: 'Expenses', value: r.expenses, color: SERIES.expense },
                    { key: 'net', label: 'Net', value: r.income - r.expenses, color: 'transparent' },
                  ]}
                />
              )
            }}
          />
          <Bar dataKey="income" name="Income" fill={SERIES.income} radius={[2, 2, 0, 0]} maxBarSize={22} />
          <Bar
            dataKey="expenses"
            name="Expenses"
            fill={SERIES.expense}
            radius={[2, 2, 0, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Expenses-only bars (daily / weekly spending) against the period's average. */
export function SpendingBars({
  rows,
  average,
  currency,
  unit,
  height = 260,
}: {
  rows: ReportCashFlow[]
  average: number
  currency: string
  unit: string
  height?: number
}) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={MARGIN} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={SERIES.grid} />
          <XAxis
            dataKey="period"
            tickFormatter={formatPeriodTick}
            tickLine={false}
            axisLine={{ stroke: SERIES.axis }}
            tick={TICK}
            tickMargin={6}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={40} tick={TICK} />
          <Tooltip
            cursor={{ fill: SERIES.cursor, opacity: 0.6 }}
            content={(p: TipProps) => {
              const r = rowOf(p)
              if (!r) return null
              const diff = r.expenses - average
              return (
                <Slip
                  title={periodLong(r.period)}
                  currency={currency}
                  rows={[{ key: 'out', label: 'Spent', value: r.expenses, color: SERIES.expense }]}
                  foot={
                    average > 0 && r.expenses > 0
                      ? `${formatMoney(Math.abs(diff), currency)} ${diff >= 0 ? 'above' : 'below'} the ${unit} average`
                      : undefined
                  }
                />
              )
            }}
          />
          {average > 0 && (
            <ReferenceLine
              y={average}
              stroke="var(--foreground)"
              strokeOpacity={0.55}
              strokeDasharray="3 3"
            />
          )}
          <Bar dataKey="expenses" name="Spent" radius={[2, 2, 0, 0]} maxBarSize={28}>
            {rows.map((r) => (
              <Cell
                key={r.period}
                fill={SERIES.expense}
                fillOpacity={average > 0 && r.expenses > average ? 1 : 0.38}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
