import { RefreshCw, Trash2, Pencil } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Money } from '@/components/common/Money'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { EmptyState } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatShortDate, relativeTime } from '@/lib/dates'
import { signedAmount } from '@/lib/money'
import { removePending, retryPending, syncManager, usePendingTransactions, useSyncState } from '@/lib/offline'
import { uiStore, useUIStore } from '@/lib/ui-store'

export function PendingSheet() {
  const { pendingOpen } = useUIStore()
  const items = usePendingTransactions()
  const s = useSyncState()
  const [discard, setDiscard] = useState<string | null>(null)

  return (
    <ResponsiveSheet
      open={pendingOpen}
      onOpenChange={uiStore.setPending}
      title="Offline queue"
      description={
        s.online
          ? 'Transactions waiting to reach the server.'
          : 'You are offline. Items sync automatically when you reconnect.'
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">
            {s.lastSyncAt
              ? `Last attempt ${relativeTime(new Date(s.lastSyncAt).toISOString())}`
              : 'No sync attempted yet'}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={s.syncing || items.length === 0}
            onClick={() => {
              void syncManager.syncNow({ force: true }).then(() => toast.success('Sync attempted'))
            }}
          >
            <RefreshCw data-icon="inline-start" className={s.syncing ? 'animate-spin' : ''} /> Retry sync
          </Button>
        </div>
      }
    >
      {items.length === 0 ? (
        <EmptyState title="Nothing pending" description="Every transaction has been saved to the server." />
      ) : (
        <ul className="flex flex-col divide-y">
          {items.map((item) => {
            const p = item.payload
            return (
              <li key={item.client_id} className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.payee || p.description || p.type}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatShortDate(p.transaction_date)} · {item.attempts} attempt
                      {item.attempts === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Money
                    minor={signedAmount(p.type, p.amount)}
                    currency={p.currency}
                    tone="auto"
                    className="text-sm font-semibold"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={item.status === 'failed' ? 'destructive' : 'secondary'}>
                    {item.status === 'failed' ? 'Failed' : item.status === 'syncing' ? 'Syncing' : 'Pending'}
                  </Badge>
                  {item.last_error && <span className="text-destructive text-xs">{item.last_error}</span>}
                </div>
                <div className="flex gap-2">
                  {item.status === 'failed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        uiStore.setPending(false)
                        uiStore.openAdd({ pendingClientId: item.client_id })
                      }}
                    >
                      <Pencil data-icon="inline-start" /> Fix
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void retryPending(item.client_id).then(() => syncManager.syncNow({ force: true }))
                    }}
                  >
                    <RefreshCw data-icon="inline-start" /> Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setDiscard(item.client_id)}
                  >
                    <Trash2 data-icon="inline-start" /> Discard
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <ConfirmDialog
        open={discard !== null}
        onOpenChange={(o) => !o && setDiscard(null)}
        title="Discard this transaction?"
        description="It was never saved to the server and will be lost permanently."
        confirmLabel="Discard"
        destructive
        onConfirm={async () => {
          if (discard) {
            await removePending(discard)
            toast.success('Discarded')
          }
        }}
      />
    </ResponsiveSheet>
  )
}
