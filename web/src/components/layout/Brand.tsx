import { cn } from '@/lib/utils'

/**
 * The mark: a ledger page with two crossing ruled strokes (the X), and a
 * saffron tick in the corner where a bookkeeper would initial a checked entry.
 */
export function LogoMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8 shrink-0', className)} aria-hidden="true">
      <rect
        width="32"
        height="32"
        rx="7"
        className={inverted ? 'fill-ink-foreground' : 'fill-ink dark:fill-ink-foreground'}
      />
      <path
        d="M10 9.5 22 22.5M22 9.5 10 22.5"
        className={inverted ? 'stroke-ink' : 'stroke-ink-foreground dark:stroke-ink'}
        strokeWidth="2.6"
        strokeLinecap="square"
      />
      <path
        d="M22.5 26.5h5v-5"
        className="stroke-saffron"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="square"
      />
    </svg>
  )
}

/** Mark plus the serif wordmark. `inverted` for the ink bar. */
export function Logo({
  className,
  inverted,
  sub,
}: {
  className?: string
  inverted?: boolean
  sub?: React.ReactNode
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark inverted={inverted} className="size-7" />
      <span className="leading-none">
        <span className="font-display block text-[1.375rem] font-medium tracking-tight">Xpenses</span>
        {sub && <span className="eyebrow mt-1 block">{sub}</span>}
      </span>
    </span>
  )
}
