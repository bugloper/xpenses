import { createElement } from 'react'
import { ArrowLeftRight, Scale } from 'lucide-react'
import { iconFor } from '@/lib/icons'
import { cn } from '@/lib/utils'

type Props = {
  icon?: string | null
  color?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Special glyphs for non-category transactions. */
  kind?: 'transfer' | 'adjustment'
}

const SIZES = { sm: 'size-8 [&>svg]:size-4', md: 'size-10 [&>svg]:size-5', lg: 'size-14 [&>svg]:size-7' }

export function CategoryIcon({ icon, color, size = 'md', className, kind }: Props) {
  const c = kind ? '#64748b' : color || '#64748b'
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full', SIZES[size], className)}
      style={{ backgroundColor: `${c}22`, color: c }}
      aria-hidden
    >
      {createElement(kind === 'transfer' ? ArrowLeftRight : kind === 'adjustment' ? Scale : iconFor(icon), {
        strokeWidth: 2.2,
      })}
    </span>
  )
}
