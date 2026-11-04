import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { Segmented } from '@/components/common/Segmented'
import { EmptyState, ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import type { DateRange } from '@/lib/dates'
import { useReportCategories } from '@/lib/queries'
import { pct1, pctOf } from '@/lib/reports'
import type { FlowType } from '@/types/api'

const CategoryDonutChart = lazy(() => import('./charts').then((m) => ({ default: m.CategoryDonutChart })))

export function CategoriesTab({
  range,
  type,
  onType,
  currency,
}: {
  range: DateRange
  type: FlowType
  onType: (t: FlowType) => void
  currency: string
}) {
  const q = useReportCategories(range.from, range.to, type)
  const [active, setActive] = useState<string | null>(null)
  const rows = useMemo(
    () => (q.data ?? []).filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount),
    [q.data],
  )
  const total = rows.reduce((n, r) => n + r.amount, 0)
  const count = rows.reduce((n, r) => n + r.count, 0)
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        aria-label="Flow type"
        value={type}
        onChange={onType}
        options={[
          { value: 'expense', label: 'Expenses', tone: 'expense' },
          { value: 'income', label: 'Income', tone: 'income' },
        ]}
      />
      <section className="bg-card ring-foreground/10 rounded-2xl p-4 ring-1">
        {q.isPending ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
        ) : rows.length === 0 ? (
          <EmptyState
            title={`No ${type === 'expense' ? 'expenses' : 'income'} in this period`}
            className="py-8"
          />
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="flex flex-col items-center gap-1 lg:sticky lg:top-4">
              <Suspense fallback={<Skeleton className="h-52 w-52 rounded-full" />}>
                <CategoryDonutChart
                  rows={rows}
                  total={total}
                  currency={currency}
                  label={type === 'expense' ? 'Spent' : 'Earned'}
                  activeId={active}
                />
              </Suspense>
              <p className="text-muted-foreground text-xs">
                {count} transaction{count === 1 ? '' : 's'} · {rows.length} categor
                {rows.length === 1 ? 'y' : 'ies'}
              </p>
            </div>
            <ol className="flex w-full flex-col gap-1" aria-label="Ranked categories">
              {rows.map((r, i) => {
                const key = r.category_id ?? 'none'
                const share = pctOf(r.amount, total)
                const inner = (
                  <>
                    <span className="text-muted-foreground tabular w-5 shrink-0 text-right text-xs">
                      {i + 1}
                    </span>
                    <CategoryIcon icon={r.icon} color={r.color} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{r.name}</span>
                        <Money
                          minor={r.amount}
                          currency={currency}
                          className="shrink-0 text-sm font-semibold"
                        />
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${share}%`, backgroundColor: r.color || '#64748b' }}
                          />
                        </span>
                        <span className="text-muted-foreground tabular shrink-0 text-[11px]">
                          {pct1(r.amount, total)}% · {r.count}×
                        </span>
                      </span>
                    </span>
                    {r.category_id && <ChevronRight className="text-muted-foreground size-4 shrink-0" />}
                  </>
                )
                const cls = 'hover:bg-muted/60 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left'
                return (
                  <li key={key} onMouseEnter={() => setActive(key)} onMouseLeave={() => setActive(null)}>
                    {r.category_id ? (
                      <Link
                        to="/transactions"
                        search={{ category: r.category_id, from: range.from, to: range.to, tab: type }}
                        className={cls}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className={cls}>{inner}</div>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        )}
      </section>
    </div>
  )
}
