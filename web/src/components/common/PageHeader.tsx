import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A screen's masthead: a mono eyebrow (where you are, or the period), the
 * serif title, a line of context, and the screen's actions on the right. A
 * hairline rule closes it off from the content.
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
  rule = true,
}: {
  title: ReactNode
  eyebrow?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
  rule?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-6 gap-y-3',
        rule && 'border-b pb-5',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="font-display text-[2rem] leading-[1.05] font-medium sm:text-[2.5rem]">{title}</h1>
        {description && <p className="text-muted-foreground mt-2 max-w-prose text-sm">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** A titled block within a screen: mono label, a rule running to the action. */
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
        <div className="flex items-center gap-3">
          {title && <h2 className="eyebrow text-foreground/80 shrink-0">{title}</h2>}
          <span aria-hidden className="bg-border h-px flex-1" />
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
