import { cn } from '@/lib/utils'

export type SegmentOption<T extends string> = {
  value: T
  label: string
  tone?: 'income' | 'expense' | 'neutral'
}

/**
 * A choice of a few named options, set like index tabs on a ledger: the one
 * in use is a raised sheet of paper; the rest sit flat in the tray.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
  'aria-label': ariaLabel,
}: {
  value: T
  onChange: (v: T) => void
  options: SegmentOption<T>[]
  className?: string
  size?: 'sm' | 'md' | 'lg'
  'aria-label'?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('bg-muted inline-flex w-full gap-0.5 rounded-md border p-0.5 sm:w-fit', className)}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 rounded-[5px] font-medium whitespace-nowrap transition-colors sm:flex-none sm:px-4',
              size === 'sm' && 'h-7 px-2.5 text-xs',
              size === 'md' && 'h-8 px-3 text-[0.8125rem]',
              size === 'lg' && 'h-10 px-3.5 text-sm',
              active
                ? cn(
                    'bg-card shadow-[0_1px_0_0_var(--border),0_1px_3px_-1px_rgb(0_0_0/0.12)]',
                    o.tone === 'income'
                      ? 'text-income'
                      : o.tone === 'expense'
                        ? 'text-expense'
                        : 'text-foreground',
                  )
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
