import { Badge } from '@/components/ui/badge'
import { confidenceTone } from '@/lib/reconciliation'
import { cn } from '@/lib/utils'
import type { BankLineStatus, ManualLineStatus } from '@/types/api'

const BANK: Record<BankLineStatus, { label: string; cls: string }> = {
  matched: { label: 'Matched', cls: 'bg-income/15 text-income' },
  unrecorded: { label: 'Unrecorded', cls: 'bg-warning/15 text-warning' },
  ignored: { label: 'Ignored', cls: 'bg-muted text-muted-foreground' },
  transfer: { label: 'Transfer', cls: 'bg-chart-2/15 text-chart-2' },
}
const MANUAL: Record<ManualLineStatus, { label: string; cls: string }> = {
  matched: { label: 'Matched', cls: 'bg-income/15 text-income' },
  unmatched: { label: 'Unmatched', cls: 'bg-warning/15 text-warning' },
  possible_duplicate: { label: 'Possible duplicate', cls: 'bg-expense/15 text-expense' },
  ignored: { label: 'Ignored', cls: 'bg-muted text-muted-foreground' },
  transfer: { label: 'Transfer', cls: 'bg-chart-2/15 text-chart-2' },
}

export function BankStatusBadge({ status, className }: { status: BankLineStatus; className?: string }) {
  const m = BANK[status] ?? BANK.unrecorded
  return <Badge className={cn('border-transparent', m.cls, className)}>{m.label}</Badge>
}

export function ManualStatusBadge({ status, className }: { status: ManualLineStatus; className?: string }) {
  const m = MANUAL[status] ?? MANUAL.unmatched
  return <Badge className={cn('border-transparent', m.cls, className)}>{m.label}</Badge>
}

/** 0–100 confidence pill, coloured by bucket. */
export function ConfidencePill({ value, className }: { value: number; className?: string }) {
  const tone = confidenceTone(value)
  return (
    <span
      data-tone={tone}
      className={cn(
        'tabular inline-flex h-5 items-center rounded-full px-1.5 text-[11px] font-semibold',
        tone === 'high' && 'bg-income/15 text-income',
        tone === 'medium' && 'bg-warning/15 text-warning',
        tone === 'low' && 'bg-muted text-muted-foreground',
        className,
      )}
      title={`${value}% confidence`}
    >
      {value}%
    </span>
  )
}
