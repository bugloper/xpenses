import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A screen's own heading. The top bar already shows the title on a phone, so
 * the h1 appears from md up; the description and actions always show.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="sr-only text-2xl font-semibold tracking-tight md:not-sr-only">{title}</h1>
        {description && <p className="text-muted-foreground text-sm md:mt-1">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** The small grey heading over a group of panels, with an optional action. */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 px-1">
          {title && <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
