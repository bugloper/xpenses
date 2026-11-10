import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Panel } from '@/components/common/kit'
import { Segmented } from '@/components/common/Segmented'
import { EmptyState, ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import type { DateRange } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { useReportCategories } from '@/lib/queries'
import { pct1, pctOf, refundsBeyondSpending, rollupCategories, type CategoryRollup } from '@/lib/reports'
import { cn } from '@/lib/utils'
import type { FlowType, ReportCategory } from '@/types/api'

const FALLBACK = 'var(--series-other)'
/** Rank · icon · name · entries · share · amount · action. On phones: icon · name · amount · action. */
const COLS =
  'grid-cols-[2rem_minmax(0,1fr)_5.5rem_2rem] md:grid-cols-[1.5rem_2rem_minmax(0,1fr)_4.5rem_minmax(8rem,15rem)_8rem_2.25rem]'

export function CategoriesTab({
  range,
  type,
  onType,
  currency,
}: {
  range: DateRange
  type: FlowType
  /** Offer the expenses / income switch; without it the tab shows one flow. */
  onType?: (t: FlowType) => void
  currency: string
}) {
  const q = useReportCategories(range.from, range.to, type)
  const [active, setActive] = useState<string | null>(null)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const groups = useMemo(() => rollupCategories(q.data ?? []), [q.data])
  const rows = groups.map((g) => g.row)
  const total = rows.reduce((n, r) => n + r.amount, 0)
  // Refunds that outweigh their category's spending: off the total, not ranked.
  const refunds = refundsBeyondSpending(q.data ?? [])
  const count = rows.reduce((n, r) => n + r.count, 0)
  const expense = type === 'expense'
  return (
    <div className="flex flex-col gap-4">
      {onType && (
        <Segmented
          aria-label="Flow type"
          value={type}
          onChange={onType}
          options={[
            { value: 'expense', label: 'Expenses', tone: 'expense' },
            { value: 'income', label: 'Income', tone: 'income' },
          ]}
        />
      )}
      <Panel
        flush
        eyebrow={
          rows.length > 0
            ? `${count} transaction${count === 1 ? '' : 's'} · ${rows.length} categor${rows.length === 1 ? 'y' : 'ies'}`
            : expense
              ? 'Expenses by category'
              : 'Income by category'
        }
        title={expense ? 'Where the money went' : 'Where the money came from'}
        action={
          rows.length > 0 ? (
            <div className="text-right">
              <div className="eyebrow">{expense ? 'Spent' : 'Received'}</div>
              <div
                className={cn(
                  'figure mt-1 text-[1.5rem] leading-none',
                  expense ? 'text-expense' : 'text-income',
                )}
              >
                {formatMoney(total + refunds, currency)}
              </div>
              {refunds < 0 && (
                <div className="text-muted-foreground mt-1 text-xs">
                  after {formatMoney(-refunds, currency)} refunds not ranked
                </div>
              )}
            </div>
          ) : undefined
        }
      >
        {q.isPending ? (
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-2.5 w-full" />
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
        ) : rows.length === 0 ? (
          <EmptyState title={`No ${expense ? 'expenses' : 'income'} in this period`} className="py-10" />
        ) : (
          <>
            <Composition rows={rows} total={total} active={active} onHover={setActive} />
            <div
              aria-hidden
              className={cn('eyebrow hidden gap-x-2.5 border-b px-4 py-2 sm:px-5 md:grid md:gap-x-3', COLS)}
            >
              <span className="hidden text-right md:block">#</span>
              <span className="col-span-2">Category</span>
              <span className="text-right">Entries</span>
              <span>Share</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            <ol className="divide-rule divide-y" aria-label="Ranked categories">
              {groups.map((g, i) => {
                const key = g.row.category_id ?? 'none'
                return (
                  <GroupItem
                    key={key}
                    group={g}
                    rank={i + 1}
                    total={total}
                    currency={currency}
                    range={range}
                    type={type}
                    open={openGroup === key}
                    onToggle={() => setOpenGroup((o) => (o === key ? null : key))}
                    onHover={setActive}
                  />
                )
              })}
            </ol>
          </>
        )}
      </Panel>
    </div>
  )
}

/** The whole period as one ruled strip, each category a segment in its colour. */
function Composition({
  rows,
  total,
  active,
  onHover,
}: {
  rows: ReportCategory[]
  total: number
  active: string | null
  onHover: (id: string | null) => void
}) {
  return (
    <div className="border-b px-4 py-4 sm:px-5">
      <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-[2px]" aria-hidden>
        {rows.map((r) => {
          const key = r.category_id ?? 'none'
          return (
            <span
              key={key}
              title={`${r.name} · ${pct1(r.amount, total)}%`}
              onMouseEnter={() => onHover(key)}
              onMouseLeave={() => onHover(null)}
              className="h-full min-w-[2px] transition-opacity"
              style={{
                flexGrow: r.amount,
                flexBasis: 0,
                background: r.color || FALLBACK,
                opacity: active && active !== key ? 0.3 : 1,
              }}
            />
          )
        })}
      </div>
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
  const share = pctOf(r.amount, total)
  const color = r.color || FALLBACK
  // The row's end control stretches over the whole row, so the row is the target.
  const stretch = 'after:absolute after:inset-0 after:content-[""]'
  return (
    <li onMouseEnter={() => onHover(key)} onMouseLeave={() => onHover(null)}>
      <div
        className={cn(
          'relative grid min-h-14 items-center gap-x-2.5 px-4 py-2.5 transition-colors sm:px-5 md:gap-x-3',
          (expandable || r.category_id) && 'hover:bg-muted/55',
          open && 'bg-muted/40',
          COLS,
        )}
      >
        <span className="text-muted-foreground hidden text-right font-mono text-xs tabular-nums md:block">
          {rank}
        </span>
        <CategoryIcon icon={r.icon} color={r.color} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{r.name}</div>
          <div className="mt-1.5 flex items-center gap-2 md:hidden">
            <ShareBar value={share} color={color} />
            <span className="text-muted-foreground w-[5.25rem] shrink-0 text-right font-mono text-[0.6875rem] tabular-nums">
              {pct1(r.amount, total)}% · {r.count}×
            </span>
          </div>
        </div>
        <span className="text-muted-foreground hidden text-right font-mono text-xs tabular-nums md:block">
          {r.count}
        </span>
        <div className="hidden items-center gap-2 md:flex">
          <ShareBar value={share} color={color} />
          <span className="text-muted-foreground w-11 shrink-0 text-right font-mono text-[0.6875rem] tabular-nums">
            {pct1(r.amount, total)}%
          </span>
        </div>
        <span className="tabular text-right text-sm font-medium">{formatMoney(r.amount, currency)}</span>
        {expandable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} ${r.name} sub-categories`}
            onClick={onToggle}
            className={cn(
              'text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex size-9 items-center justify-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none',
              stretch,
            )}
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : r.category_id ? (
          <Link
            to="/transactions"
            search={{ category: r.category_id, from: range.from, to: range.to, tab: type }}
            aria-label={`${r.name} transactions`}
            className={cn(
              'text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex size-9 items-center justify-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none',
              stretch,
            )}
          >
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span />
        )}
      </div>
      {expandable && open && (
        <ul className="bg-muted/40 border-rule border-t pb-2" aria-label={`${r.name} sub-categories`}>
          {group.children.map((c) => (
            <li key={c.category_id ?? c.name}>
              <SubRow
                row={c}
                total={group.amount}
                color={color}
                currency={currency}
                range={range}
                type={type}
              />
            </li>
          ))}
          {r.category_id && (
            <li className={cn('grid gap-x-2.5 px-4 pt-1 sm:px-5 md:gap-x-3', COLS)}>
              <Link
                to="/transactions"
                search={{ category: r.category_id, from: range.from, to: range.to, tab: type }}
                className="text-accent-foreground col-start-2 col-end-[-1] inline-flex h-9 w-fit items-center gap-1 text-[0.8125rem] font-medium underline-offset-4 hover:underline md:col-start-3"
              >
                All {r.name} transactions
                <ChevronRight className="size-3.5" />
              </Link>
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

function ShareBar({ value, color }: { value: number; color: string }) {
  return (
    <span className="bg-bar block h-1.5 min-w-0 flex-1 overflow-hidden rounded-[2px]">
      <span
        className="block h-full rounded-[2px]"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }}
      />
    </span>
  )
}

function SubRow({
  row: c,
  total,
  color,
  currency,
  range,
  type,
}: {
  row: ReportCategory
  total: number
  color: string
  currency: string
  range: DateRange
  type: FlowType
}) {
  const share = pctOf(c.amount, total)
  const inner = (
    <>
      <span className="hidden md:block" />
      <span />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span aria-hidden className="bg-border h-px w-3 shrink-0" />
          <span className="truncate text-[0.8125rem]">{c.name}</span>
        </span>
        <span className="mt-1 flex items-center gap-2 pl-5 md:hidden">
          <ShareBar value={share} color={color} />
          <span className="text-muted-foreground w-[5.25rem] shrink-0 text-right font-mono text-[0.6875rem] tabular-nums">
            {pct1(c.amount, total)}% · {c.count}×
          </span>
        </span>
      </span>
      <span className="text-muted-foreground hidden text-right font-mono text-xs tabular-nums md:block">
        {c.count}
      </span>
      <span className="hidden items-center gap-2 md:flex">
        <ShareBar value={share} color={color} />
        <span className="text-muted-foreground w-11 shrink-0 text-right font-mono text-[0.6875rem] tabular-nums">
          {pct1(c.amount, total)}%
        </span>
      </span>
      <span className="tabular text-muted-foreground text-right text-[0.8125rem]">
        {formatMoney(c.amount, currency)}
      </span>
    </>
  )
  const cls = cn('grid min-h-11 items-center gap-x-2.5 md:gap-x-3 px-4 py-1.5 sm:px-5', COLS)
  // "General" rows share the parent's id and are reached through the parent link.
  return c.category_id && c.name !== 'General' ? (
    <Link
      to="/transactions"
      search={{ category: c.category_id, from: range.from, to: range.to, tab: type }}
      className={cn(cls, 'hover:bg-muted/70 transition-colors')}
    >
      {inner}
      <ChevronRight className="text-muted-foreground/60 size-4 justify-self-center" />
    </Link>
  ) : (
    <div className={cls}>
      {inner}
      <span />
    </div>
  )
}
