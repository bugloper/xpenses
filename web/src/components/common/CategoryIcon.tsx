import { createElement } from 'react'
import { ArrowLeftRight, HandCoins, Scale } from 'lucide-react'
import { iconFor } from '@/lib/icons'
import { cn } from '@/lib/utils'

type Props = {
  icon?: string | null
  color?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Special glyphs for non-category transactions. */
  kind?: 'transfer' | 'adjustment' | 'loan'
}

const SIZES = { sm: 'size-8 [&>svg]:size-4', md: 'size-10 [&>svg]:size-5', lg: 'size-14 [&>svg]:size-7' }

export function CategoryIcon({ icon, color, size = 'md', className, kind }: Props) {
  const c = kind ? '#64748b' : color || '#64748b'
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-md', SIZES[size], className)}
      style={{ backgroundColor: `${c}1f`, color: c, boxShadow: `inset 0 0 0 1px ${c}2e` }}
      aria-hidden
    >
      {createElement(
        kind === 'transfer'
          ? ArrowLeftRight
          : kind === 'adjustment'
            ? Scale
            : kind === 'loan'
              ? HandCoins
              : iconFor(icon),
        {
          strokeWidth: 2,
        },
      )}
    </span>
  )
}
