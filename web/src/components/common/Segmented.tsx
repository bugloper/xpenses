import { cn } from '@/lib/utils'

export type SegmentOption<T extends string> = {
  value: T
  label: string
  tone?: 'income' | 'expense' | 'neutral'
}

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
      className={cn('bg-muted inline-flex w-full rounded-xl p-1', className)}
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
              'flex-1 rounded-lg font-medium transition-colors',
              size === 'sm' && 'h-7 px-2 text-xs',
              size === 'md' && 'h-8 px-3 text-sm',
              size === 'lg' && 'h-10 px-3 text-sm',
              active
                ? cn(
                    'bg-background text-foreground shadow-sm',
                    o.tone === 'income' && 'text-income',
                    o.tone === 'expense' && 'text-expense',
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
