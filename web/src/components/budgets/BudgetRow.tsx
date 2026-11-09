import { ChevronRight } from 'lucide-react'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Meter } from '@/components/common/kit'
import { Money } from '@/components/common/Money'
import { budgetStatus, budgetTone, type BudgetTone } from '@/lib/budgets'
import { cn } from '@/lib/utils'
import type { ReportBudget } from '@/types/api'

/** How each budget state is drawn: the meter's colour and the status text's. */
export const BUDGET_TONE: Record<BudgetTone, { meter: 'ink' | 'warn' | 'expense'; text: string }> = {
  unused: { meter: 'ink', text: 'text-muted-foreground' },
  ok: { meter: 'ink', text: 'text-muted-foreground' },
  warn: { meter: 'warn', text: 'text-warn' },
  hot: { meter: 'warn', text: 'text-warn' },
  over: { meter: 'expense', text: 'text-expense' },
}

/** The thin meter for one budget, filled to the share spent and never past the end. */
export function BudgetMeter({ b, className }: { b: ReportBudget; className?: string }) {
  return (
    <Meter
      value={b.pct}
      tone={BUDGET_TONE[budgetTone(b)].meter}
      label={`${b.name} budget`}
      className={className}
    />
  )
}

/** What is left of a budget, or how far past the limit it went. */
export function BudgetLeft({
  b,
  currency,
  className,
}: {
  b: ReportBudget
  currency: string
  className?: string
}) {
  const over = b.remaining < 0
  return (
    <span className={cn('tabular', over ? 'text-expense' : 'text-muted-foreground', className)}>
      {over ? 'over by ' : ''}
      <Money minor={Math.abs(b.remaining)} currency={currency} />
      {over ? '' : ' left'}
    </span>
  )
}

/**
 * The column layout shared by the table header and every row: category,
 * spent, limit, left / over by, meter with its status, and the chevron.
 */
export const BUDGET_GRID =
  'md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1.6fr)_1rem] md:items-center md:gap-x-5'

/** The column labels over the budget table (desktop only). */
export function BudgetTableHead() {
  return (
    <div className={cn('eyebrow bg-muted/40 hidden border-b px-5 py-2.5', BUDGET_GRID)} aria-hidden>
      <span>Category</span>
      <span className="text-right">Spent</span>
      <span className="text-right">Limit</span>
      <span className="text-right">Left</span>
      <span>Used</span>
      <span />
    </div>
  )
}

/**
 * One budget on the Budgets page. A table row on desktop; on a phone a ruled
 * line with the name and status, the figures at the end and the meter under.
 * Over-limit rows carry a vermilion mark in the margin.
 */
export function BudgetRow({
  b,
  currency,
  onEdit,
}: {
  b: ReportBudget
  currency: string
  onEdit: () => void
}) {
  const tone = BUDGET_TONE[budgetTone(b)]
  const over = b.level === 'over' && b.spent > 0
  const unused = b.spent <= 0
  return (
    <li className="relative">
      {over && <span aria-hidden className="bg-expense absolute inset-y-0 left-0 w-[3px]" />}
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${b.name} budget`}
        className={cn(
          'hover:bg-muted/55 focus-visible:bg-muted/70 block w-full px-4 py-3.5 text-left transition-colors focus-visible:outline-none sm:px-5 md:py-3',
          BUDGET_GRID,
        )}
      >
        {/* Category; on a phone the spent figure and its limit sit at the end. */}
        <div className="flex min-w-0 items-center gap-3">
          <CategoryIcon icon={b.icon} color={b.color} size="sm" />
          <div className={cn('min-w-0 flex-1 truncate text-sm font-medium', unused && 'text-foreground/75')}>
            {b.name}
          </div>
          <div className="shrink-0 text-right md:hidden">
            <Money
              minor={b.spent}
              currency={currency}
              className={cn('block text-sm font-medium', over && 'text-expense')}
            />
            <span className="text-muted-foreground tabular block text-xs">
              of <Money minor={b.amount} currency={currency} />
            </span>
          </div>
          <ChevronRight className="text-muted-foreground/50 -mr-1 size-4 shrink-0 md:hidden" />
        </div>

        {/* Desktop columns. */}
        <Money
          minor={b.spent}
          currency={currency}
          className={cn(
            'hidden text-right text-sm font-medium md:block',
            over && 'text-expense',
            unused && 'text-muted-foreground font-normal',
          )}
        />
        <Money minor={b.amount} currency={currency} className="hidden text-right text-sm md:block" />
        <BudgetLeft
          b={b}
          currency={currency}
          className={cn('hidden text-right text-sm md:block', over && 'font-medium')}
        />

        {/* Meter: under the line on a phone (status and what is left beneath), its own column on desktop. */}
        <div className="mt-2.5 pl-11 md:mt-0 md:pl-0">
          <BudgetMeter b={b} />
          <div className="mt-1.5 flex items-baseline justify-between gap-3 text-xs">
            <span className={cn(tone.text, over && 'font-medium')}>{budgetStatus(b)}</span>
            <BudgetLeft b={b} currency={currency} className="md:hidden" />
          </div>
        </div>
        <ChevronRight className="text-muted-foreground/50 hidden size-4 md:block" />
      </button>
    </li>
  )
}
