import { cn } from '@/lib/utils'
import { formatMoney, type FormatMoneyOptions } from '@/lib/money'

type Props = {
  minor: number
  currency?: string
  /** Colour by sign (green positive, red negative). */
  tone?: 'auto' | 'neutral' | 'income' | 'expense'
  sign?: FormatMoneyOptions['sign']
  className?: string
}

export function Money({ minor, currency = 'BTN', tone = 'neutral', sign = 'auto', className }: Props) {
  const resolved = tone === 'auto' ? (minor > 0 ? 'income' : minor < 0 ? 'expense' : 'neutral') : tone
  return (
    <span
      className={cn(
        'tabular',
        resolved === 'income' && 'text-income',
        resolved === 'expense' && 'text-expense',
        className,
      )}
    >
      {formatMoney(minor, currency, { sign })}
    </span>
  )
}
