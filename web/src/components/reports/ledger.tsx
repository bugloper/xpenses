// Ledger columns: the key figures of a report set side by side on one sheet,
// each under its mono label, divided by hairline rules.
import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type LedgerFigure = {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'income' | 'expense' | 'muted'
}

export function LedgerFigures({
  items,
  loading,
  className,
}: {
  items: LedgerFigure[]
  loading?: boolean
  className?: string
}) {
  return (
    <dl
      className={cn(
        'bg-border grid gap-px overflow-hidden rounded-lg border',
        items.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3',
        className,
      )}
    >
      {items.map((f, i) => (
        <div
          key={f.label}
          className={cn(
            'bg-card flex min-w-0 flex-col px-4 py-4 sm:px-5 sm:py-5',
            // An odd cell out on a two-column phone grid spans the row.
            items.length % 2 === 1 && i === items.length - 1 && 'col-span-2 sm:col-span-1',
          )}
        >
          <dt className="eyebrow">{f.label}</dt>
          <dd className="mt-2.5 min-w-0">
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <span
                className={cn(
                  // Four across leaves less room: a smaller figure that wraps
                  // rather than cutting off a long amount.
                  'figure block leading-none break-words',
                  items.length === 4
                    ? 'text-[1.375rem] sm:text-[1.625rem]'
                    : 'truncate text-[1.625rem] sm:text-[2rem]',
                  f.tone === 'income' && 'text-income',
                  f.tone === 'expense' && 'text-expense',
                  f.tone === 'muted' && 'text-muted-foreground',
                )}
              >
                {f.value}
              </span>
            )}
            {f.hint && !loading && <span className="text-muted-foreground mt-2 block text-xs">{f.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** The key under a chart's title: a swatch (or a dashed line) per series. */
export function ChartKey({
  items,
  className,
}: {
  items: { label: string; color: string; dashed?: boolean }[]
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', className)}>
      {items.map((i) => (
        <span key={i.label} className="eyebrow flex items-center gap-1.5">
          {i.dashed ? (
            <span aria-hidden className="w-3.5 border-t border-dashed" style={{ borderColor: i.color }} />
          ) : (
            <span aria-hidden className="size-2.5 rounded-[2px]" style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  )
}
