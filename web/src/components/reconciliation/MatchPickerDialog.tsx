import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatShortDate } from '@/lib/dates'
import { bankSide, matchesSearch, rankManualCandidates } from '@/lib/reconciliation'
import { transactionTitle } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import type { BankLine, ManualLine } from '@/types/api'

export function MatchPickerDialog({
  open,
  onOpenChange,
  line,
  candidates,
  currency,
  busy,
  onMatch,
  onAdjust,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  line: BankLine | null
  /** Unmatched manual transactions on the statement account. */
  candidates: ManualLine[]
  currency: string
  busy: boolean
  onMatch: (txId: string) => void
  onAdjust: (txId: string) => void
}) {
  const [q, setQ] = useState('')
  const ranked = useMemo(() => {
    if (!line) return []
    return rankManualCandidates(line, candidates).filter((c) =>
      matchesSearch([c.tx.payee, c.tx.description, c.tx.category_name, c.tx.notes], q),
    )
  }, [line, candidates, q])
  const side = line ? bankSide(line) : null
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setQ('')
      }}
      title="Match manually"
      description={
        line && side ? (
          <>
            {line.description || 'Bank line'} · {formatShortDate(line.transaction_date)} ·{' '}
            <Money
              minor={side.isDebit ? -side.amount : side.amount}
              currency={currency}
              tone="auto"
              sign="always"
            />
          </>
        ) : undefined
      }
      desktopWidth="sm:max-w-lg"
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search payee, description, category"
            className="h-10 rounded-xl pl-9"
            aria-label="Search manual transactions"
          />
        </div>
        {ranked.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No unmatched manual transactions on this account{q ? ' match your search' : ''}.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5" aria-label="Candidates">
            {ranked.map((c) => {
              const t = c.tx
              const disabledReason = !c.sameDirection ? 'Opposite direction (debit vs credit)' : null
              return (
                <li
                  key={t.id}
                  data-candidate={t.id}
                  className={cn(
                    'bg-muted/40 flex flex-col gap-2 rounded-xl p-3',
                    disabledReason && 'opacity-60',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <CategoryIcon
                      icon={t.category_icon}
                      color={t.category_color}
                      size="sm"
                      kind={
                        t.type === 'transfer'
                          ? 'transfer'
                          : t.type === 'adjustment'
                            ? 'adjustment'
                            : undefined
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{transactionTitle(t)}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {formatShortDate(t.transaction_date)} ·{' '}
                        {c.dateDiff === 0 ? 'same day' : `${c.dateDiff}d apart`}
                        {t.category_name && <> · {t.category_name}</>}
                        {t.status === 'possible_duplicate' && (
                          <span className="text-expense"> · possible duplicate</span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      <Money
                        minor={t.type === 'expense' ? -t.amount : t.amount}
                        currency={t.currency}
                        tone="auto"
                        sign="always"
                        className="text-sm font-semibold"
                      />
                      {c.sameAmount ? (
                        <span className="text-income text-[11px]">same amount</span>
                      ) : (
                        <span className="text-warning tabular text-[11px]">
                          diff <Money minor={c.amountDiff} currency={currency} sign="always" />
                        </span>
                      )}
                    </div>
                  </div>
                  {disabledReason ? (
                    <p className="text-muted-foreground text-xs">{disabledReason}</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      <Button type="button" size="xs" disabled={busy} onClick={() => onMatch(t.id)}>
                        {c.sameAmount ? 'Match' : 'Match (keep difference)'}
                      </Button>
                      {!c.sameAmount && (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={busy}
                          onClick={() => onAdjust(t.id)}
                          title="Match and create an adjustment transaction for the difference"
                        >
                          Match with adjustment
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </ResponsiveSheet>
  )
}
