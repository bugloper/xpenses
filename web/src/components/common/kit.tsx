// The handful of building blocks every screen is made of: surfaces, rows,
// numbers and section labels. Built on the shadcn primitives so the whole app
// shares one set of radii, borders and type (the same kit as Bangkee).
import { Link } from '@tanstack/react-router'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A card. `flush` drops the padding for lists that run edge to edge. */
export function Panel({
  title,
  description,
  action,
  footer,
  flush,
  className,
  children,
  id,
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  footer?: ReactNode
  flush?: boolean
  className?: string
  children?: ReactNode
  id?: string
}) {
  return (
    <section id={id} className={cn('bg-card text-card-foreground overflow-hidden rounded-[1.25rem] border', className)}>
      {(title || action) && (
        <header className={cn('flex items-start justify-between gap-3 px-4 pt-4 sm:px-5', flush ? 'pb-3' : 'pb-0')}>
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
            {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children !== undefined && (
        <div className={cn(!flush && 'p-4 sm:p-5', flush && (title || action) && 'border-t')}>{children}</div>
      )}
      {footer && <footer className="bg-muted/40 border-t px-4 py-3 text-sm sm:px-5">{footer}</footer>}
    </section>
  )
}

/** A divided list inside a flush panel. */
export function Rows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('divide-y', className)}>{children}</div>
}

/**
 * One line of a list: something to recognise it by, a title and a line
 * under it, and whatever belongs at the end.
 */
export function Row({
  to,
  onClick,
  leading,
  title,
  subtitle,
  trailing,
  chevron,
  className,
  dimmed,
  ariaLabel,
}: {
  to?: string
  onClick?: () => void
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  chevron?: boolean
  className?: string
  dimmed?: boolean
  ariaLabel?: string
}) {
  const body = (
    <>
      {leading}
      <div className={cn('min-w-0 flex-1', dimmed && 'opacity-60')}>
        <div className="truncate text-sm font-medium">{title}</div>
        {subtitle && <div className="text-muted-foreground mt-0.5 truncate text-[0.8125rem]">{subtitle}</div>}
      </div>
      {trailing && <div className="flex shrink-0 flex-col items-end gap-1 text-right">{trailing}</div>}
      {chevron && <ChevronRight className="text-muted-foreground/60 size-4 shrink-0" />}
    </>
  )
  const classes = cn(
    'flex min-h-15 items-center gap-3 px-4 py-3 sm:px-5',
    (to || onClick) && 'hover:bg-muted/50 focus-visible:bg-muted/60 transition-colors focus-visible:outline-none',
    className,
  )
  if (to) {
    return (
      <Link to={to} className={classes} aria-label={ariaLabel}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(classes, 'w-full text-left')} aria-label={ariaLabel}>
        {body}
      </button>
    )
  }
  return <div className={classes}>{body}</div>
}

/** A figure with its label, for the rows of numbers on dashboards. */
export function Stat({
  label,
  value,
  tone,
  to,
  hint,
  icon: Icon,
}: {
  label: string
  value: ReactNode
  tone?: 'income' | 'expense' | 'warn'
  to?: string
  hint?: ReactNode
  icon?: LucideIcon
}) {
  const body = (
    <>
      <div className="text-muted-foreground flex items-center gap-1.5 text-[0.8125rem] font-medium">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </div>
      <div
        className={cn(
          'tabular mt-1.5 text-2xl font-semibold tracking-tight',
          tone === 'income' && 'text-income',
          tone === 'expense' && 'text-expense',
          tone === 'warn' && 'text-warn',
        )}
      >
        {value}
      </div>
      {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
    </>
  )
  const classes = 'bg-card block rounded-[1.25rem] border p-4'
  return to ? (
    <Link to={to} className={cn(classes, 'hover:bg-muted/40 transition-colors')}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  )
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>{children}</div>
}

/** The large figure at the top of a screen. */
export function BigAmount({ label, children, aside }: { label: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <span className="tabular text-4xl font-semibold tracking-tight">{children}</span>
        {aside}
      </div>
    </div>
  )
}

/** A label and a value on one line. */
export function KV({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1.5 text-sm', className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

/** The small grey heading over a group of panels. */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{children}</h2>
      {action}
    </div>
  )
}

/** A sentence of guidance beside a form or list. */
export function Note({
  children,
  tone = 'info',
  icon: Icon,
  className,
}: {
  children: ReactNode
  tone?: 'info' | 'warn'
  icon?: LucideIcon
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-xl px-3.5 py-3 text-sm leading-relaxed',
        tone === 'info' && 'bg-accent/60 text-accent-foreground',
        tone === 'warn' && 'bg-warn/10 text-foreground',
        className,
      )}
    >
      {Icon && <Icon className={cn('mt-0.5 size-4 shrink-0', tone === 'warn' && 'text-warn')} />}
      <div>{children}</div>
    </div>
  )
}

/** One strip of news above the screen: what just happened, or what is wrong. */
const BANNER_TONES = {
  ok: 'border-paid/20 bg-paid/[0.07] [&>svg]:text-paid',
  alert: 'border-destructive/25 bg-destructive/[0.06] [&>svg]:text-destructive',
  warn: 'border-warn/30 bg-warn/[0.09] [&>svg]:text-warn',
} as const

export function Banner({
  tone,
  icon: Icon,
  children,
  action,
}: {
  tone: keyof typeof BANNER_TONES
  icon: LucideIcon
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      role={tone === 'ok' ? 'status' : 'alert'}
      className={cn('flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm', BANNER_TONES[tone])}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {action && <div className="text-primary shrink-0 font-medium">{action}</div>}
    </div>
  )
}
