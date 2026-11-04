import { useId } from 'react'
import { cn } from '@/lib/utils'

/** The mark: an X on the brand indigo. */
export function LogoMark({ className }: { className?: string }) {
  // Each mark its own gradient: a url(#id) pointing into a hidden copy paints nothing.
  const gradient = useId()
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8 shrink-0', className)} aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.58 0.22 277)" />
          <stop offset="1" stopColor="oklch(0.42 0.2 277)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradient})`} />
      <path d="M10.5 10.5l11 11M21.5 10.5l-11 11" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ className, sub }: { className?: string; sub?: React.ReactNode }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="leading-tight">
        <span className="block text-[0.9375rem] font-semibold tracking-tight">Xpensiv</span>
        {sub && <span className="text-muted-foreground block max-w-40 truncate text-xs">{sub}</span>}
      </span>
    </span>
  )
}
