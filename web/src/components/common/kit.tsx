// The building blocks every screen is made of, in the ledger style: sheets of
// paper with hairline rules, mono column labels, serif figures. Screens compose
// these rather than styling surfaces by hand, so the app reads as one product.
import { Link } from '@tanstack/react-router'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A sheet: the card every block of content sits on. The header holds a serif
 * title and its action, ruled off from the body. `flush` drops the body
 * padding for lists and tables that run edge to edge.
 */
export function Panel({
  title,
  eyebrow,
  description,
  action,
  footer,
  flush,
  className,
  children,
  id,
}: {
  title?: ReactNode
  eyebrow?: ReactNode
  description?: ReactNode
  action?: ReactNode
  footer?: ReactNode
  flush?: boolean
  className?: string
  children?: ReactNode
  id?: string
}) {
  const hasHeader = title || action || eyebrow
  return (
    <section
      id={id}
      className={cn('bg-card text-card-foreground overflow-hidden rounded-lg border', className)}
    >
      {hasHeader && (
        <header className="flex items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
            {title && <h2 className="font-display text-[1.1875rem] leading-tight">{title}</h2>}
            {description && <p className="text-muted-foreground mt-1 text-[0.8125rem]">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      {children !== undefined && <div className={cn(!flush && 'p-4 sm:p-5')}>{children}</div>}
      {footer && <footer className="bg-muted/50 border-t px-4 py-3 text-sm sm:px-5">{footer}</footer>}
    </section>
  )
}

/** A ruled list inside a flush panel. */
export function Rows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('divide-rule divide-y', className)}>{children}</div>
}

/**
 * One line of a list: something to recognise it by, a title and a line under
 * it, and whatever belongs at the end (usually a figure).
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
      <div className={cn('min-w-0 flex-1', dimmed && 'opacity-55')}>
        <div className="truncate text-sm font-medium">{title}</div>
        {subtitle && <div className="text-muted-foreground mt-0.5 truncate text-[0.8125rem]">{subtitle}</div>}
      </div>
      {trailing && <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">{trailing}</div>}
      {chevron && <ChevronRight className="text-muted-foreground/50 size-4 shrink-0" />}
    </>
  )
  const classes = cn(
    'flex min-h-14 items-center gap-3 px-4 py-3 sm:px-5',
    (to || onClick) &&
      'hover:bg-muted/55 focus-visible:bg-muted/70 transition-colors focus-visible:outline-none',
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
      <button
        type="button"
        onClick={onClick}
        className={cn(classes, 'w-full text-left')}
        aria-label={ariaLabel}
      >
        {body}
      </button>
    )
  }
  return <div className={classes}>{body}</div>
}

const TONE_TEXT = {
  income: 'text-income',
  expense: 'text-expense',
  warn: 'text-warn',
} as const

/** A figure with its ledger label: mono caps over a serif number. */
export function Stat({
  label,
  value,
  tone,
  to,
  hint,
  icon: Icon,
  className,
}: {
  label: string
  value: ReactNode
  tone?: 'income' | 'expense' | 'warn'
  to?: string
  hint?: ReactNode
  icon?: LucideIcon
  className?: string
}) {
  const body = (
    <>
      <div className="eyebrow flex items-center gap-1.5">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </div>
      <div className={cn('figure mt-2 text-[1.75rem] leading-none', tone && TONE_TEXT[tone])}>{value}</div>
      {hint && <div className="text-muted-foreground mt-2 text-xs">{hint}</div>}
    </>
  )
  const classes = cn('bg-card block rounded-lg border p-4 sm:p-5', className)
  return to ? (
    <Link to={to} className={cn(classes, 'hover:border-foreground/25 transition-colors')}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  )
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>{children}</div>
}

/** The large serif figure at the top of a screen. */
export function BigAmount({
  label,
  children,
  aside,
}: {
  label: ReactNode
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <span className="figure text-[2.75rem] leading-none sm:text-[3.5rem]">{children}</span>
        {aside}
      </div>
    </div>
  )
}

/** A label and a value on one ruled line, like a line on a receipt. */
export function KV({
  label,
  children,
  className,
}: {
  label: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-2 text-sm', className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

/** The mono label over a group of panels, with a rule running to its action. */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="eyebrow text-foreground/80 shrink-0">{children}</h2>
      <span aria-hidden className="bg-border h-px flex-1" />
      {action}
    </div>
  )
}

/** A thin horizontal meter: a share of something, in one colour. */
export function Meter({
  value,
  tone = 'ink',
  className,
  label,
}: {
  /** 0..100; values over 100 fill the bar. */
  value: number
  tone?: 'ink' | 'saffron' | 'income' | 'expense' | 'warn'
  className?: string
  label?: string
}) {
  const fill = {
    ink: 'bg-foreground/80',
    saffron: 'bg-saffron',
    income: 'bg-income',
    expense: 'bg-expense',
    warn: 'bg-warn',
  }[tone]
  return (
    <div
      role={label ? 'meter' : undefined}
      aria-label={label}
      aria-valuenow={label ? Math.round(value) : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      className={cn('bg-bar h-1.5 w-full overflow-hidden rounded-[2px]', className)}
    >
      <div
        className={cn('h-full rounded-[2px] transition-[width]', fill)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

/** A sentence of guidance beside a form or list: a margin note. */
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
        'flex gap-2.5 rounded-md border-l-[3px] px-3.5 py-3 text-sm leading-relaxed',
        tone === 'info' && 'border-saffron bg-saffron-soft/50 text-foreground',
        tone === 'warn' && 'border-warn bg-warn/10 text-foreground',
        className,
      )}
    >
      {Icon && (
        <Icon
          className={cn('mt-0.5 size-4 shrink-0', tone === 'warn' ? 'text-warn' : 'text-accent-foreground')}
        />
      )}
      <div>{children}</div>
    </div>
  )
}

/** One strip of news above the screen: what just happened, or what is wrong. */
const BANNER_TONES = {
  ok: 'border-l-paid bg-paid/[0.07] [&>svg]:text-paid',
  alert: 'border-l-destructive bg-destructive/[0.06] [&>svg]:text-destructive',
  warn: 'border-l-warn bg-warn/[0.09] [&>svg]:text-warn',
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
      className={cn(
        'flex items-start gap-3 rounded-md border border-l-[3px] px-3.5 py-2.5 text-sm',
        BANNER_TONES[tone],
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {action && <div className="shrink-0 font-medium underline underline-offset-4">{action}</div>}
    </div>
  )
}
