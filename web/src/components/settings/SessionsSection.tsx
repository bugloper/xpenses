import { Monitor, Smartphone, X } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorState } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/api'
import { relativeTime } from '@/lib/dates'
import { useRevokeSession, useSessions } from '@/lib/queries/auth'
import type { AuthSession } from '@/types/api'

/** "Chrome on macOS"-style label from a raw user agent; falls back to the raw string. */
export function describeUserAgent(ua: string): string {
  if (!ua) return 'Unknown device'
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X|Macintosh/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : null
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null
  if (!os && !browser) return ua.length > 60 ? ua.slice(0, 57) + '…' : ua
  return [browser, os].filter(Boolean).join(' on ')
}

function isMobile(ua: string) {
  return /iPhone|iPad|Android|Mobile/.test(ua)
}

function SessionRow({ s }: { s: AuthSession }) {
  const revoke = useRevokeSession()
  const Icon = isMobile(s.user_agent) ? Smartphone : Monitor
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-xl">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{describeUserAgent(s.user_agent)}</p>
          {s.current && <Badge variant="secondary">Current</Badge>}
        </div>
        <p className="text-muted-foreground text-xs">
          Last seen {relativeTime(s.last_seen_at)} · signed in {relativeTime(s.created_at)}
        </p>
      </div>
      {!s.current && (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Revoke session"
          disabled={revoke.isPending}
          onClick={() =>
            revoke.mutate(s.id, {
              onSuccess: () => toast.success('Session revoked'),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          <X data-icon="inline-start" /> Revoke
        </Button>
      )}
    </li>
  )
}

export function SessionsSection() {
  const { data, isPending, error, refetch } = useSessions()
  if (isPending) return <Skeleton className="h-24 w-full rounded-2xl" />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} compact />
  const sessions = [...data].sort((a, b) => Number(b.current) - Number(a.current))
  return (
    <div className="bg-card ring-foreground/10 rounded-2xl px-4 ring-1">
      <ul className="divide-y">
        {sessions.map((s) => (
          <SessionRow key={s.id} s={s} />
        ))}
      </ul>
    </div>
  )
}
