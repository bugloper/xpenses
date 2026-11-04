import { AlertTriangle, CloudOff, CloudUpload, Loader2 } from 'lucide-react'
import { Banner } from '@/components/common/kit'
import { useSyncState } from '@/lib/offline'
import { uiStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'

/** A strip above the screen: "Offline" / "Syncing…" / "3 pending" / "1 failed". Hidden when idle. */
export function SyncPill() {
  const s = useSyncState()
  if (s.online && !s.syncing && s.pending === 0 && s.failed === 0) return null
  let label: string
  let Icon = CloudUpload
  let tone: 'ok' | 'alert' | 'warn' = 'warn'
  if (s.syncing) {
    label = 'Syncing…'
    Icon = Loader2
    tone = 'ok'
  } else if (!s.online) {
    label = s.pending > 0 ? `Offline · ${s.pending} pending` : 'Offline'
    Icon = CloudOff
  } else if (s.failed > 0) {
    label = `${s.failed} failed`
    Icon = AlertTriangle
    tone = 'alert'
  } else {
    label = `${s.pending} pending`
  }
  return (
    <button
      type="button"
      onClick={() => uiStore.setPending(true)}
      className={cn('w-full text-left', s.syncing && '[&_svg]:animate-spin')}
      aria-label={`Sync status: ${label}`}
    >
      <Banner tone={tone} icon={Icon} action={s.pending > 0 || s.failed > 0 ? 'View' : undefined}>
        {label}
      </Banner>
    </button>
  )
}
