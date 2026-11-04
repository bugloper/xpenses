import { CloudOff, CloudUpload, Loader2, AlertTriangle } from 'lucide-react'
import { useSyncState } from '@/lib/offline'
import { uiStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'

/** Header pill: "Offline" / "Syncing…" / "3 pending" / "1 failed". Hidden when idle. */
export function SyncPill({ className }: { className?: string }) {
  const s = useSyncState()
  if (s.online && !s.syncing && s.pending === 0 && s.failed === 0) return null
  let label: string
  let Icon = CloudUpload
  let tone = 'bg-warning/15 text-warning'
  if (s.syncing) {
    label = 'Syncing…'
    Icon = Loader2
  } else if (!s.online) {
    label = s.pending > 0 ? `Offline · ${s.pending} pending` : 'Offline'
    Icon = CloudOff
    tone = 'bg-muted text-muted-foreground'
  } else if (s.failed > 0) {
    label = `${s.failed} failed`
    Icon = AlertTriangle
    tone = 'bg-destructive/15 text-destructive'
  } else {
    label = `${s.pending} pending`
  }
  return (
    <button
      type="button"
      onClick={() => uiStore.setPending(true)}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors',
        tone,
        className,
      )}
      aria-label={`Sync status: ${label}`}
    >
      <Icon className={cn('size-3.5', s.syncing && 'animate-spin')} />
      {label}
    </button>
  )
}
