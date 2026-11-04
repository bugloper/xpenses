import { Loader2, ScanLine } from 'lucide-react'
import { KV } from '@/components/common/kit'
import { formatShortDate } from '@/lib/dates'
import type { ScanState } from '@/lib/receipts'
import type { Receipt } from '@/types/api'

export function ReceiptDetails({ receipt }: { receipt: Receipt }) {
  return (
    <div className="divide-y" data-testid="receipt">
      {receipt.bank && <KV label="Bank">{receipt.bank}</KV>}
      {receipt.reference && (
        <KV label="Journal no.">
          <span className="tabular">{receipt.reference}</span>
        </KV>
      )}
      {receipt.payment_type && <KV label="Payment type">{receipt.payment_type}</KV>}
      {(receipt.date || receipt.time) && (
        <KV label="Paid">
          {receipt.date ? formatShortDate(receipt.date) : ''}
          {receipt.date && receipt.time ? ' · ' : ''}
          {receipt.time ? receipt.time.slice(0, 5) : ''}
        </KV>
      )}
    </div>
  )
}

/** The scan's progress and outcome under a freshly attached screenshot. */
export function ReceiptCard({ scan, receipt }: { scan: ScanState; receipt: Receipt | null }) {
  if (scan.status === 'idle') return null
  if (scan.status === 'scanning') {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
        <Loader2 className="size-4 animate-spin" /> Reading the screenshot…
      </p>
    )
  }
  if (scan.status === 'unavailable') return null
  if (scan.status === 'error' || !scan.result?.recognised || !receipt) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
        <ScanLine className="size-4" /> Could not read payment details from this screenshot. Enter the amount
        yourself.
      </p>
    )
  }
  return (
    <div
      className="bg-muted/40 rounded-xl border px-3 py-1"
      role="status"
      aria-label="Details read from the screenshot"
    >
      <p className="text-muted-foreground flex items-center gap-1.5 py-1.5 text-xs font-medium">
        <ScanLine className="size-3.5" /> Read from the screenshot — check before saving
      </p>
      <ReceiptDetails receipt={receipt} />
    </div>
  )
}
