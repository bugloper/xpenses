import { Link } from '@tanstack/react-router'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { EmptyState, ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMoney } from '@/lib/money'
import { rollupCategories } from '@/lib/reports'
import type { ReportCategory } from '@/types/api'

export function CategoryDonut({
  data,
  loading,
  error,
  onRetry,
  currency,
  range,
}: {
  data?: ReportCategory[]
  loading: boolean
  error: unknown
  onRetry: () => void
  currency: string
  range: { from: string; to: string }
}) {
  if (loading && !data) return <Skeleton className="h-64 w-full rounded-xl" />
  if (error && !data) return <ErrorState error={error} onRetry={onRetry} compact />
  const rows = rollupCategories((data ?? []).filter((r) => r.amount > 0)).map((g) => g.row)
  if (rows.length === 0) return <EmptyState title="No expenses in this period" className="py-8" />
  const total = rows.reduce((n, r) => n + r.amount, 0)
  const top = rows.slice(0, 6)
  const rest = rows.slice(6)
  const legend = rest.length
    ? [
        ...top,
        {
          category_id: null,
          name: `${rest.length} more`,
          icon: 'circle-dashed',
          color: '#64748b',
          amount: rest.reduce((n, r) => n + r.amount, 0),
          count: 0,
          pct: 0,
        },
      ]
    : top
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
      <div className="relative h-52 w-52 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={legend}
              dataKey="amount"
              nameKey="name"
              innerRadius={64}
              outerRadius={94}
              paddingAngle={2}
              stroke="none"
            >
              {legend.map((r, i) => (
                <Cell key={i} fill={r.color || '#64748b'} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'var(--popover)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                fontSize: 12,
                color: 'var(--popover-foreground)',
              }}
              formatter={(value, name) => [formatMoney(Number(value), currency), String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-muted-foreground text-[11px]">Spent</span>
          <Money minor={total} currency={currency} className="text-sm font-semibold" />
        </div>
      </div>
      <ul className="grid w-full gap-x-6 gap-y-1 lg:grid-cols-2">
        {legend.map((r, i) => {
          const pct = total > 0 ? Math.round((r.amount * 1000) / total) / 10 : 0
          const inner = (
            <>
              <CategoryIcon icon={r.icon} color={r.color} size="sm" />
              <span className="min-w-0 flex-1 text-sm">{r.name}</span>
              <span className="text-muted-foreground tabular w-12 shrink-0 text-right text-xs">{pct}%</span>
              <Money
                minor={r.amount}
                currency={currency}
                className="w-24 shrink-0 text-right text-sm font-medium whitespace-nowrap"
              />
            </>
          )
          return (
            <li key={`${r.category_id ?? 'x'}-${i}`}>
              {r.category_id ? (
                <Link
                  to="/transactions"
                  search={{ category: r.category_id, from: range.from, to: range.to, tab: 'expense' }}
                  className="hover:bg-muted/60 flex items-center gap-3 rounded-lg px-1 py-1.5"
                >
                  {inner}
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-1 py-1.5">{inner}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
