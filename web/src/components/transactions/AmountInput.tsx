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
        'bg-muted/60 flex items-baseline justify-center gap-2 rounded-[1.25rem] px-4 py-5',
        invalid && 'ring-destructive/50 ring-2',
      )}
    >
      <span className="text-muted-foreground text-lg font-medium">{currencySymbol(currency)}</span>
      <input
        ref={ref}
        id={id}
        aria-label="Amount"
        aria-invalid={invalid}
        type="text"
        inputMode="decimal"
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
          'tabular placeholder:text-muted-foreground/40 w-full min-w-0 bg-transparent text-center text-5xl font-semibold tracking-tight outline-none',
          tone === 'expense' && 'text-expense',
          tone === 'income' && 'text-income',
        )}
        style={{ width: `${Math.max(4, value.length + 1)}ch`, maxWidth: '100%' }}
      />
    </div>
  )
})
