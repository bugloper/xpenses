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
import { cn } from '@/lib/utils'

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
          <span className="eyebrow">
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
        <ul className="divide-rule -mx-4 -mb-4 divide-y border-t lg:-mx-5">
          {items.map((item) => {
            const p = item.payload
            const failed = item.status === 'failed'
            return (
              <li
                key={item.client_id}
                className={cn('flex flex-col gap-2.5 px-4 py-3.5 lg:px-5', failed && 'bg-destructive/[0.04]')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={failed ? 'destructive' : 'secondary'}>
                        {failed ? 'Failed' : item.status === 'syncing' ? 'Syncing' : 'Pending'}
                      </Badge>
                      <span className="eyebrow">
                        {formatShortDate(p.transaction_date)} · {item.attempts} attempt
                        {item.attempts === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-sm font-medium first-letter:uppercase">
                      {p.payee || p.description || p.type}
                    </p>
                  </div>
                  <Money
                    minor={signedAmount(p.type, p.amount)}
                    currency={p.currency}
                    tone="auto"
                    className="pt-0.5 text-[0.9375rem] font-medium"
                  />
                </div>
                {item.last_error && (
                  <p className="text-destructive border-destructive/60 border-l-2 pl-2.5 text-xs leading-relaxed">
                    {item.last_error}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {failed && (
                    <Button
                      size="sm"
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
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive ml-auto"
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
