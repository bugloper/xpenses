import { ArrowLeftRight, Ban, Check, ChevronDown, Link2, MoreHorizontal, Plus, Undo2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Money } from '@/components/common/Money'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatShortDate } from '@/lib/dates'
import { bankSide, rejectKey, ruleLabel, sortSuggestions } from '@/lib/reconciliation'
import { transactionTitle } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import type { BankLine, Suggestion } from '@/types/api'
import { BankStatusBadge, ConfidencePill } from './badges'

export type BankLineHandlers = {
  onReject: (txId: string) => void
  onConfirm: (s: Suggestion) => void
  onAdjust: (s: Suggestion) => void
  onMatchManually: () => void
  onIgnore: () => void
  onTransfer: () => void
  onCreate: () => void
  onUnmatch: () => void
  onFocusManual: (txId: string) => void
}

export function BankLineCard({
  line,
  currency,
  rejected,
  highlighted,
  busy,
  handlers: h,
  registerRef,
}: {
  line: BankLine
  currency: string
  rejected: Set<string>
  highlighted: boolean
  busy: boolean
  handlers: BankLineHandlers
  registerRef?: (el: HTMLLIElement | null) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const side = bankSide(line)
  const suggestions = useMemo(
    () => sortSuggestions(line.suggestions).filter((s) => !rejected.has(rejectKey(line.id, s.transaction_id))),
    [line.suggestions, line.id, rejected],
  )
  const top = suggestions[0]
  const rest = suggestions.slice(1)
  const linked = line.transaction
  const rec = line.reconciliation

  return (
    <li
      ref={registerRef}
      data-bank-id={line.id}
      data-status={line.status}
      className={cn(
        'flex flex-col gap-2 px-3 py-2.5 transition-shadow',
        highlighted && 'bg-primary/5 ring-primary rounded-xl ring-2 ring-inset',
        line.status === 'ignored' && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={line.description}>
            {line.description || '(no description)'}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {formatShortDate(line.transaction_date)}
            {line.reference && <> · {line.reference}</>}
            {line.balance !== null && (
              <>
                {' '}
                · bal <Money minor={line.balance} currency={currency} />
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Money
            minor={side.isDebit ? -side.amount : side.amount}
            currency={currency}
            tone="auto"
            sign="always"
            className="text-sm font-semibold"
          />
          <BankStatusBadge status={line.status} />
        </div>
      </div>

      {linked && (
        <button
          type="button"
          onClick={() => h.onFocusManual(linked.id)}
          className="bg-muted/50 hover:bg-muted flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Link2 className="text-muted-foreground size-3.5 shrink-0" />
            <span className="truncate">{transactionTitle(linked)}</span>
            {linked.category_name && <span className="text-muted-foreground truncate">· {linked.category_name}</span>}
          </span>
          <span className="text-muted-foreground shrink-0 tabular">
            {rec && ruleLabel(rec.rule)}
            {rec && rec.amount_diff !== 0 && (
              <>
                {' '}
                · <Money minor={rec.amount_diff} currency={currency} sign="always" className="text-warning" />
              </>
            )}
            {rec && rec.date_diff_days > 0 && <> · {rec.date_diff_days}d</>}
          </span>
        </button>
      )}
      {line.status === 'ignored' && rec?.note && <p className="text-muted-foreground text-xs italic">{rec.note}</p>}

      {line.status === 'unrecorded' && top && (
        <div className="flex flex-col gap-1.5">
          <SuggestionRow s={top} currency={currency} busy={busy} onConfirm={() => h.onConfirm(top)} onAdjust={() => h.onAdjust(top)} onReject={() => h.onReject(top.transaction_id)} onFocus={() => h.onFocusManual(top.transaction_id)} />
          {rest.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-xs"
              >
                <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
                {expanded ? 'Fewer suggestions' : `${rest.length} more suggestion${rest.length === 1 ? '' : 's'}`}
              </button>
              {expanded &&
                rest.map((s) => (
                  <SuggestionRow key={s.transaction_id} s={s} currency={currency} busy={busy} onConfirm={() => h.onConfirm(s)} onAdjust={() => h.onAdjust(s)} onReject={() => h.onReject(s.transaction_id)} onFocus={() => h.onFocusManual(s.transaction_id)} />
                ))}
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {line.status === 'unrecorded' ? (
          <>
            <Button type="button" size="xs" variant="outline" disabled={busy} onClick={h.onMatchManually}>
              <Link2 data-icon="inline-start" /> Match
            </Button>
            <Button type="button" size="xs" variant="outline" disabled={busy} onClick={h.onCreate}>
              <Plus data-icon="inline-start" /> Create
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="xs" variant="ghost" disabled={busy} aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={h.onTransfer}>
                  <ArrowLeftRight /> Mark as transfer
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={h.onIgnore}>
                  <Ban /> Ignore
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={h.onUnmatch}>
            <Undo2 data-icon="inline-start" />
            {line.status === 'ignored' ? 'Un-ignore' : line.status === 'transfer' ? 'Unlink transfer' : 'Unmatch'}
          </Button>
        )}
      </div>
    </li>
  )
}

function SuggestionRow({
  s,
  currency,
  busy,
  onConfirm,
  onAdjust,
  onReject,
  onFocus,
}: {
  s: Suggestion
  currency: string
  busy: boolean
  onConfirm: () => void
  onAdjust: () => void
  onReject: () => void
  onFocus: () => void
}) {
  const tx = s.transaction
  return (
    <div
      data-suggestion={s.transaction_id}
      className="border-primary/30 bg-primary/5 flex flex-col gap-1.5 rounded-lg border px-2.5 py-2 text-xs"
    >
      <div className="flex items-center gap-2">
        <ConfidencePill value={s.confidence} />
        <span className="text-muted-foreground truncate">{ruleLabel(s.rule)}</span>
        <span className="ml-auto flex shrink-0 gap-2 tabular">
          {s.amount_diff !== 0 ? (
            <Money minor={s.amount_diff} currency={currency} sign="always" className="text-warning" />
          ) : (
            <span className="text-income">same amount</span>
          )}
          <span className="text-muted-foreground">{s.date_diff_days === 0 ? 'same day' : `${s.date_diff_days}d`}</span>
        </span>
      </div>
      <button type="button" onClick={onFocus} className="truncate text-left font-medium hover:underline">
        {tx ? `${transactionTitle(tx)} · ${formatShortDate(tx.transaction_date)}` : s.transaction_id}
        {tx?.category_name && <span className="text-muted-foreground font-normal"> · {tx.category_name}</span>}
      </button>
      {s.reason && <p className="text-muted-foreground">{s.reason}</p>}
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="xs" disabled={busy} onClick={onConfirm}>
          <Check data-icon="inline-start" /> Confirm
        </Button>
        {s.amount_diff !== 0 && (
          <Button type="button" size="xs" variant="outline" disabled={busy} onClick={onAdjust} title="Match and record the difference as an adjustment">
            Confirm + adjust
          </Button>
        )}
        <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={onReject} aria-label="Reject suggestion">
          <X data-icon="inline-start" /> Reject
        </Button>
      </div>
    </div>
  )
}
