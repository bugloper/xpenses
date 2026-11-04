import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { Segmented } from '@/components/common/Segmented'
import { EmptyState, ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import type { DateRange } from '@/lib/dates'
import { useReportCategories } from '@/lib/queries'
import { pct1, pctOf, rollupCategories, type CategoryRollup } from '@/lib/reports'
import { cn } from '@/lib/utils'
import type { FlowType, ReportCategory } from '@/types/api'

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
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const groups = useMemo(() => rollupCategories((q.data ?? []).filter((r) => r.amount > 0)), [q.data])
  const rows = groups.map((g) => g.row)
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
              {groups.map((g, i) => (
                <GroupItem
                  key={g.row.category_id ?? 'none'}
                  group={g}
                  rank={i + 1}
                  total={total}
                  currency={currency}
                  range={range}
                  type={type}
                  open={openGroup === (g.row.category_id ?? 'none')}
                  onToggle={() =>
                    setOpenGroup((o) => (o === (g.row.category_id ?? 'none') ? null : (g.row.category_id ?? 'none')))
                  }
                  onHover={setActive}
                />
              ))}
            </ol>
          </div>
        )}
      </section>
    </div>
  )
}

function GroupItem({
  group,
  rank,
  total,
  currency,
  range,
  type,
  open,
  onToggle,
  onHover,
}: {
  group: CategoryRollup
  rank: number
  total: number
  currency: string
  range: DateRange
  type: FlowType
  open: boolean
  onToggle: () => void
  onHover: (id: string | null) => void
}) {
  const r = group.row
  const key = r.category_id ?? 'none'
  const expandable = group.children.length > 0
  return (
    <li onMouseEnter={() => onHover(key)} onMouseLeave={() => onHover(null)}>
      <div className="hover:bg-muted/60 flex w-full items-center gap-2 rounded-xl px-2 py-2">
        <span className="text-muted-foreground tabular w-5 shrink-0 text-right text-xs">{rank}</span>
        <CategoryIcon icon={r.icon} color={r.color} size="sm" />
        <RowBody row={r} total={total} currency={currency} />
        {expandable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} ${r.name} sub-categories`}
            onClick={onToggle}
            className="text-muted-foreground hover:text-foreground rounded-md p-1"
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : r.category_id ? (
          <Link
            to="/transactions"
            search={{ category: r.category_id, from: range.from, to: range.to, tab: type }}
            aria-label={`${r.name} transactions`}
            className="text-muted-foreground hover:text-foreground rounded-md p-1"
          >
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className="w-6" />
        )}
      </div>
      {expandable && open && (
        <ul className="ml-9 flex flex-col gap-0.5 border-l pl-3" aria-label={`${r.name} sub-categories`}>
          {group.children.map((c) => (
            <li key={c.category_id ?? c.name}>
              <SubRow row={c} total={group.amount} currency={currency} range={range} type={type} />
            </li>
          ))}
          {r.category_id && (
            <li>
              <Link
                to="/transactions"
                search={{ category: r.category_id, from: range.from, to: range.to, tab: type }}
                className="text-primary block px-2 py-1.5 text-xs font-medium"
              >
                All {r.name} transactions
              </Link>
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

function RowBody({ row: r, total, currency }: { row: ReportCategory; total: number; currency: string }) {
  const share = pctOf(r.amount, total)
  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{r.name}</span>
        <Money minor={r.amount} currency={currency} className="shrink-0 text-sm font-semibold" />
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
  )
}

function SubRow({
  row: c,
  total,
  currency,
  range,
  type,
}: {
  row: ReportCategory
  total: number
  currency: string
  range: DateRange
  type: FlowType
}) {
  const cls = cn('hover:bg-muted/60 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left')
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium">{c.name}</span>
          <Money minor={c.amount} currency={currency} className="shrink-0 text-xs font-semibold" />
        </span>
      </span>
      <span className="text-muted-foreground tabular w-12 shrink-0 text-right text-[11px]">{pct1(c.amount, total)}%</span>
    </>
  )
  // "General" rows share the parent's id and are reached through the parent link.
  return c.category_id && c.name !== 'General' ? (
    <Link to="/transactions" search={{ category: c.category_id, from: range.from, to: range.to, tab: type }} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  )
}
