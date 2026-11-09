import { Loader2, ScanLine } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatShortDate } from '@/lib/dates'
import { referenceLabel, type ScanState } from '@/lib/receipts'
import type { Receipt } from '@/types/api'

function Item({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="eyebrow shrink-0">{label}</dt>
      <dd
        className={
          mono ? 'truncate font-mono text-[0.8125rem] tracking-wide' : 'truncate text-sm font-medium'
        }
      >
        {children}
      </dd>
    </div>
  )
}

/** What a payment screenshot said, as ruled lines: bank, reference, type, when. */
export function ReceiptDetails({ receipt }: { receipt: Receipt }) {
  return (
    <dl className="divide-rule divide-y" data-testid="receipt">
      {receipt.bank && <Item label="Bank">{receipt.bank}</Item>}
      {receipt.reference && (
        <Item label={referenceLabel(receipt.bank)} mono>
          {receipt.reference}
        </Item>
      )}
      {receipt.payment_type && <Item label="Payment type">{receipt.payment_type}</Item>}
      {(receipt.date || receipt.time) && (
        <Item label="Paid">
          {receipt.date ? formatShortDate(receipt.date) : ''}
          {receipt.date && receipt.time ? ' · ' : ''}
          {receipt.time ? receipt.time.slice(0, 5) : ''}
        </Item>
      )}
    </dl>
  )
}

/** The scan's progress and outcome under a freshly attached screenshot. */
export function ReceiptCard({ scan, receipt }: { scan: ScanState; receipt: Receipt | null }) {
  if (scan.status === 'idle') return null
  if (scan.status === 'scanning') {
    return (
      <p className="text-muted-foreground flex items-center gap-2 px-1 text-sm" role="status">
        <Loader2 className="size-4 animate-spin" /> Reading the screenshot…
      </p>
    )
  }
  if (scan.status === 'unavailable') return null
  if (scan.status === 'error' || !scan.result?.recognised || !receipt) {
    return (
      <p className="text-muted-foreground flex items-start gap-2 px-1 text-sm" role="status">
        <ScanLine className="mt-0.5 size-4 shrink-0" /> Could not read payment details from this screenshot.
        Enter the amount yourself.
      </p>
    )
  }
  return (
    <div
      className="border-saffron bg-saffron-soft/30 rounded-md border-l-[3px] px-3.5 py-1.5"
      role="status"
      aria-label="Details read from the screenshot"
    >
      <p className="text-accent-foreground flex items-center gap-1.5 py-1.5 text-xs font-medium">
        <ScanLine className="size-3.5" /> Read from the screenshot — check before saving
      </p>
      <ReceiptDetails receipt={receipt} />
    </div>
  )
}
