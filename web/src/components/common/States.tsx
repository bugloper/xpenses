import { AlertCircle, Inbox, RefreshCw, WifiOff, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage, isApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-2xl">
        <Icon className="size-5" />
      </span>
      <p className="mt-1 font-medium">{title}</p>
      {description && <p className="text-muted-foreground max-w-xs text-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
  title,
  className,
  compact,
}: {
  error: unknown
  onRetry?: () => void
  title?: string
  className?: string
  compact?: boolean
}) {
  const offline = isApiError(error) && error.isNetwork
  const notReady = isApiError(error) && (error.status === 404 || error.status === 501)
  const Icon = offline ? WifiOff : AlertCircle
  const heading =
    title ?? (offline ? 'You are offline' : notReady ? 'Not available yet' : 'Could not load this')
  const desc = offline
    ? 'Showing nothing until the connection is back.'
    : notReady
      ? 'This part of the server is still being built.'
      : errorMessage(error)
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-2 text-center',
        compact ? 'px-4 py-6' : 'px-6 py-12',
        className,
      )}
    >
      <span className="bg-destructive/10 text-destructive flex size-10 items-center justify-center rounded-2xl">
        <Icon className="size-5" />
      </span>
      <p className="font-medium">{heading}</p>
      <p className="text-muted-foreground max-w-xs text-sm">{desc}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
          <RefreshCw data-icon="inline-start" /> Retry
        </Button>
      )}
    </div>
  )
}

export function ListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}
