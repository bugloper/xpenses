import { ArrowRight, Link2, Undo2 } from 'lucide-react'
import { Money } from '@/components/common/Money'
import { EmptyState } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { formatShortDate } from '@/lib/dates'
import { bankSide, ruleLabel } from '@/lib/reconciliation'
import { transactionTitle } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import type { Workspace } from '@/types/api'
import { BankStatusBadge } from './badges'

export function ResultsColumn({
  ws,
  currency,
  busy,
  onUnmatch,
  onJumpBank,
  onShowUnrecorded,
  onShowUnmatchedManual,
}: {
  ws: Workspace
  currency: string
  busy: boolean
  onUnmatch: (bankId: string) => void
  onJumpBank: (bankId: string) => void
  onShowUnrecorded: () => void
  onShowUnmatchedManual: () => void
}) {
  const pairs = ws.bank_transactions.filter(
    (b) => (b.status === 'matched' || b.status === 'transfer') && b.transaction,
  )
  const s = ws.summary
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 px-3 pt-3">
        <QuickCount
          label="Unrecorded bank lines"
          value={s.unrecorded_bank}
          tone={s.unrecorded_bank > 0 ? 'warning' : 'ok'}
          onClick={onShowUnrecorded}
        />
        <QuickCount
          label="Unmatched manual"
          value={s.unmatched_manual}
          tone={s.unmatched_manual > 0 ? 'warning' : 'ok'}
          onClick={onShowUnmatchedManual}
        />
      </div>
      <h3 className="text-muted-foreground px-3 text-xs font-medium">
        Matched pairs <span className="font-normal">({pairs.length})</span>
      </h3>
      {pairs.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="Nothing matched yet"
          description="Run auto-match or confirm suggestions in the bank column."
          className="py-6"
        />
      ) : (
        <ul className="divide-y">
          {pairs.map((b) => {
            const t = b.transaction!
            const r = b.reconciliation
            const side = bankSide(b)
            return (
              <li key={b.id} className="flex flex-col gap-1 px-3 py-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onJumpBank(b.id)}
                    className="min-w-0 truncate text-left text-sm font-medium hover:underline"
                  >
                    {b.description || '(bank line)'}
                  </button>
                  <Money
                    minor={side.isDebit ? -side.amount : side.amount}
                    currency={currency}
                    tone="auto"
                    sign="always"
                    className="shrink-0 font-semibold"
                  />
                </div>
                <div className="text-muted-foreground flex items-center gap-1.5">
                  <ArrowRight className="size-3 shrink-0" />
                  <span className="truncate">
                    {transactionTitle(t)} · {formatShortDate(t.transaction_date)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <BankStatusBadge status={b.status} />
                  {r && (
                    <span className="text-muted-foreground">
                      {ruleLabel(r.rule)}
                      {r.match_type === 'auto' && r.confidence < 100 ? ` · ${r.confidence}%` : ''}
                    </span>
                  )}
                  {r && r.amount_diff !== 0 && (
                    <span className="text-warning tabular">
                      diff <Money minor={r.amount_diff} currency={currency} sign="always" />
                    </span>
                  )}
                  {r && r.date_diff_days > 0 && (
                    <span className="text-muted-foreground">{r.date_diff_days}d apart</span>
                  )}
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="ml-auto"
                    disabled={busy}
                    onClick={() => onUnmatch(b.id)}
                  >
                    <Undo2 data-icon="inline-start" /> Unmatch
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function QuickCount({
  label,
  value,
  tone,
  onClick,
}: {
  label: string
  value: number
  tone: 'ok' | 'warning'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'bg-muted/50 hover:bg-muted flex flex-col items-start rounded-xl px-3 py-2 text-left transition-colors',
      )}
    >
      <span
        className={cn('tabular text-xl font-semibold', tone === 'warning' ? 'text-warning' : 'text-income')}
      >
        {value}
      </span>
      <span className="text-muted-foreground text-[11px] leading-tight">{label}</span>
    </button>
  )
}
