import { forwardRef } from 'react'
import { currencySymbol } from '@/lib/money'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  onChange: (v: string) => void
  currency?: string
  tone?: 'expense' | 'income' | 'neutral'
  invalid?: boolean
  id?: string
  autoFocus?: boolean
  allowNegative?: boolean
  onEnter?: () => void
}

/**
 * Big amount entry. Keeps the raw string (so "85." is typeable) and only allows
 * digits + one dot + up to two decimals. Parsing to minor units happens in money.ts.
 */
export const AmountInput = forwardRef<HTMLInputElement, Props>(function AmountInput(
  { value, onChange, currency = 'BTN', tone = 'neutral', invalid, id, autoFocus, allowNegative, onEnter },
  ref,
) {
  const pattern = allowNegative ? /^-?\d*(\.\d{0,2})?$/ : /^\d*(\.\d{0,2})?$/
  return (
    <div
      className={cn(
        'flex items-baseline justify-center gap-2 border-b-2 px-2 pt-3 pb-2 transition-colors',
        'focus-within:border-foreground',
        invalid ? 'border-destructive focus-within:border-destructive' : 'border-border',
      )}
    >
      <span className="figure text-muted-foreground text-2xl sm:text-[1.75rem]">
        {currencySymbol(currency)}
      </span>
      {/* The input sizes to its text: an invisible copy in the same grid cell sets the width. */}
      <span className="figure inline-grid min-w-0 text-[3.25rem] leading-none sm:text-[3.75rem]">
        <span aria-hidden className="invisible col-start-1 row-start-1 overflow-hidden pr-1 whitespace-pre">
          {value || '0.00'}
        </span>
        <input
          ref={ref}
          id={id}
          aria-label="Amount"
          aria-invalid={invalid}
          type="text"
          inputMode="decimal"
          size={1}
          autoComplete="off"
          enterKeyHint="done"
          placeholder="0.00"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            const next = e.target.value.replace(/,/g, '')
            if (next === '' || pattern.test(next)) onChange(next)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onEnter) {
              e.preventDefault()
              onEnter()
            }
          }}
          className={cn(
            'placeholder:text-muted-foreground/35 col-start-1 row-start-1 w-full min-w-0 bg-transparent text-left outline-none [font:inherit]',
            tone === 'expense' && 'text-expense',
            tone === 'income' && 'text-income',
          )}
        />
      </span>
    </div>
  )
})
