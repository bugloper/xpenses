import { ChevronRight } from 'lucide-react'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { budgetStatus, budgetTone, type BudgetTone } from '@/lib/budgets'
import { cn } from '@/lib/utils'
import type { ReportBudget } from '@/types/api'

export const TONE: Record<BudgetTone, { bar: string; text: string }> = {
  unused: { bar: 'bg-muted-foreground/30', text: 'text-muted-foreground' },
  ok: { bar: 'bg-income', text: 'text-income' },
  warn: { bar: 'bg-warning', text: 'text-warning' },
  hot: { bar: 'bg-orange-500', text: 'text-orange-500' },
  over: { bar: 'bg-expense', text: 'text-expense' },
}

/** The bar under a budget's name: filled to the share spent, never past the end. */
export function BudgetBar({ b, className }: { b: ReportBudget; className?: string }) {
  const tone = TONE[budgetTone(b)]
  return (
    <div
      className={cn('bg-muted h-1.5 w-full overflow-hidden rounded-full', className)}
      role="progressbar"
      aria-valuenow={Math.round(b.pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${b.name} budget`}
    >
      <div className={cn('h-full rounded-full transition-all', tone.bar)} style={{ width: `${Math.max(0, Math.min(100, b.pct))}%` }} />
    </div>
  )
}

/** One budget on the Budgets page: name, spent / limit, bar, what happened and what is left. */
export function BudgetRow({ b, currency, onEdit }: { b: ReportBudget; currency: string; onEdit: () => void }) {
  const tone = TONE[budgetTone(b)]
  const over = b.remaining < 0
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        className="hover:bg-muted/60 flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors"
        aria-label={`Edit ${b.name} budget`}
      >
        <CategoryIcon icon={b.icon} color={b.color} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium">{b.name}</span>
            <span className="tabular text-muted-foreground shrink-0 text-xs">
              <Money minor={b.spent} currency={currency} className={cn(over && 'text-expense font-medium')} /> /{' '}
              <Money minor={b.amount} currency={currency} />
            </span>
          </div>
          <BudgetBar b={b} className="mt-1.5" />
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
            <span className={tone.text}>{budgetStatus(b)}</span>
            <span className={cn('tabular', over ? 'text-expense' : 'text-muted-foreground')}>
              {over ? 'over by ' : ''}
              <Money minor={Math.abs(b.remaining)} currency={currency} />
              {over ? '' : ' left'}
            </span>
          </div>
        </div>
        <ChevronRight className="text-muted-foreground size-4 shrink-0" />
      </button>
    </li>
  )
}
