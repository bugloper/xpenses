import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Check, CheckCircle2, CircleAlert, FileText, Pencil, Search, Wand2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AccountIcon } from '@/components/common/AccountIcon'
import { Money } from '@/components/common/Money'
import { EmptyState } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { errorMessage } from '@/lib/api'
import { rangeLabel } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { keys, useAccounts, useCategories, useUpdateSettings } from '@/lib/queries'
import {
  bankSide,
  loadRejected,
  matchesSearch,
  rejectKey,
  saveRejected,
  type BankStatusFilter,
  type ManualStatusFilter,
} from '@/lib/reconciliation'
import { cn } from '@/lib/utils'
import type { BankLine, ManualLine, Suggestion, Workspace as WorkspaceData } from '@/types/api'
import { BankLineCard } from './BankLineCard'
import { CreateFromBankDialog, IgnoreDialog, MarkTransferDialog } from './LineDialogs'
import { ManualLineRow } from './ManualLineRow'
import { MatchPickerDialog } from './MatchPickerDialog'
import { ReconciliationReportSheet } from './ReconciliationReportSheet'
import { ResultsColumn } from './ResultsColumn'
import { useReconciliationActions } from './useReconciliationActions'

type Dialog =
  | { kind: 'match'; line: BankLine }
  | { kind: 'ignore'; line: BankLine }
  | { kind: 'transfer'; line: BankLine }
  | { kind: 'create'; line: BankLine }
  | null
type Column = 'manual' | 'bank' | 'results'

const BANK_FILTERS: { value: BankStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unrecorded', label: 'Unrecorded' },
  { value: 'suggested', label: 'Suggested' },
  { value: 'matched', label: 'Matched' },
  { value: 'transfer', label: 'Transfers' },
  { value: 'ignored', label: 'Ignored' },
]
const MANUAL_FILTERS: { value: ManualStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unmatched', label: 'Unmatched' },
  { value: 'possible_duplicate', label: 'Duplicates' },
  { value: 'matched', label: 'Matched' },
  { value: 'transfer', label: 'Transfers' },
  { value: 'ignored', label: 'Ignored' },
]

export function Workspace({ ws, promptAutoMatch, onPromptHandled }: { ws: WorkspaceData; promptAutoMatch: boolean; onPromptHandled: () => void }) {
  const desktop = useIsDesktop()
  const qc = useQueryClient()
  const actions = useReconciliationActions()
  const { data: accounts = [] } = useAccounts(true)
  const { data: categories = [] } = useCategories()
  const currency = ws.account.currency || 'BTN'
  const statementId = ws.statement.id
  const accountId = ws.account.id

  const [column, setColumn] = useState<Column>('bank')
  const [bankFilter, setBankFilter] = useState<BankStatusFilter>('all')
  const [bankSearch, setBankSearch] = useState('')
  const [bankAmount, setBankAmount] = useState<number | null>(null)
  const [manualFilter, setManualFilter] = useState<ManualStatusFilter>('all')
  const [manualSearch, setManualSearch] = useState('')
  const [highlightBank, setHighlightBank] = useState<string | null>(null)
  const [highlightManual, setHighlightManual] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [rejected, setRejected] = useState<Set<string>>(() => loadRejected(statementId))

  const bankRefs = useRef(new Map<string, HTMLLIElement>())
  const manualRefs = useRef(new Map<string, HTMLLIElement>())

  // Auto-match prompt straight after an import.
  const promptedRef = useRef(false)
  useEffect(() => {
    if (!promptAutoMatch || promptedRef.current) return
    promptedRef.current = true
    onPromptHandled()
    if (ws.summary.unrecorded_bank === 0) return
    toast('Run auto-match now?', {
      description: 'Applies unique same-amount matches within the date tolerance.',
      duration: 15_000,
      action: { label: 'Auto-match', onClick: () => void actions.autoMatch(statementId) },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptAutoMatch])

  const reject = (bankId: string, txId: string) => {
    const next = new Set(rejected)
    next.add(rejectKey(bankId, txId))
    setRejected(next)
    saveRejected(statementId, next)
  }

  const scrollTo = (map: Map<string, HTMLLIElement>, id: string) => {
    requestAnimationFrame(() => map.get(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  }
  const focusBank = useCallback(
    (bankId: string) => {
      setBankFilter('all')
      setBankSearch('')
      setBankAmount(null)
      setColumn('bank')
      setHighlightBank(bankId)
      setHighlightManual(null)
      scrollTo(bankRefs.current, bankId)
    },
    [],
  )
  const focusManual = useCallback((txId: string) => {
    setManualFilter('all')
    setManualSearch('')
    setColumn('manual')
    setHighlightManual(txId)
    setHighlightBank(null)
    scrollTo(manualRefs.current, txId)
  }, [])

  const bankByTx = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of ws.bank_transactions) {
      const txId = b.transaction?.id ?? b.reconciliation?.transaction_id
      if (txId) m.set(txId, b.id)
    }
    return m
  }, [ws.bank_transactions])

  const bankRows = useMemo(() => {
    return ws.bank_transactions.filter((b) => {
      if (bankFilter === 'suggested') {
        if (b.status !== 'unrecorded' || !b.suggestions.some((s) => !rejected.has(rejectKey(b.id, s.transaction_id)))) return false
      } else if (bankFilter !== 'all' && b.status !== bankFilter) return false
      if (bankAmount !== null && bankSide(b).amount !== bankAmount) return false
      return matchesSearch([b.description, b.reference, b.transaction?.payee, b.transaction?.description], bankSearch)
    })
  }, [ws.bank_transactions, bankFilter, bankAmount, bankSearch, rejected])

  const manualRows = useMemo(() => {
    return ws.manual_transactions.filter((t) => {
      if (manualFilter !== 'all' && t.status !== manualFilter) return false
      return matchesSearch([t.payee, t.description, t.category_name, t.notes, t.account_name, t.transfer_account_name], manualSearch)
    })
  }, [ws.manual_transactions, manualFilter, manualSearch])

  const unmatchedManual = useMemo(
    () => ws.manual_transactions.filter((t) => t.status === 'unmatched' || t.status === 'possible_duplicate'),
    [ws.manual_transactions],
  )
  const unmatchedTransfers = useMemo(() => unmatchedManual.filter((t) => t.type === 'transfer'), [unmatchedManual])

  const closeDialog = () => setDialog(null)
  const after = (ok: boolean) => {
    if (ok) closeDialog()
  }

  const handlersFor = (line: BankLine) => ({
    onReject: (txId: string) => reject(line.id, txId),
    onConfirm: (s: Suggestion) => void actions.confirm(line.id, s.transaction_id),
    onAdjust: (s: Suggestion) => void actions.adjust(line.id, s.transaction_id),
    onMatchManually: () => setDialog({ kind: 'match', line }),
    onIgnore: () => setDialog({ kind: 'ignore', line }),
    onTransfer: () => setDialog({ kind: 'transfer', line }),
    onCreate: () => setDialog({ kind: 'create', line }),
    onUnmatch: () => void actions.unmatch(line.id),
    onFocusManual: focusManual,
  })

  const bankColumn = (
    <ColumnShell
      title="Bank transactions"
      count={bankRows.length}
      total={ws.bank_transactions.length}
      filters={
        <>
          <Chips value={bankFilter} onChange={setBankFilter} options={BANK_FILTERS} />
          <div className="flex items-center gap-2">
            <SearchBox value={bankSearch} onChange={setBankSearch} placeholder="Search description, reference" />
          </div>
          {bankAmount !== null && (
            <button
              type="button"
              onClick={() => setBankAmount(null)}
              className="bg-primary/10 text-primary flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
            >
              Amount = {formatMoney(bankAmount, currency)} <X className="size-3" />
            </button>
          )}
        </>
      }
    >
      {bankRows.length === 0 ? (
        <EmptyState title="No bank lines here" description="Try a different filter." className="py-8" />
      ) : (
        <ul className="divide-y">
          {bankRows.map((b) => (
            <BankLineCard
              key={b.id}
              line={b}
              currency={currency}
              rejected={rejected}
              highlighted={highlightBank === b.id}
              busy={actions.busy}
              handlers={handlersFor(b)}
              registerRef={(el) => {
                if (el) bankRefs.current.set(b.id, el)
                else bankRefs.current.delete(b.id)
              }}
            />
          ))}
        </ul>
      )}
    </ColumnShell>
  )

  const manualColumn = (
    <ColumnShell
      title="Manual transactions"
      count={manualRows.length}
      total={ws.manual_transactions.length}
      filters={
        <>
          <Chips value={manualFilter} onChange={setManualFilter} options={MANUAL_FILTERS} />
          <SearchBox value={manualSearch} onChange={setManualSearch} placeholder="Search payee, category" />
        </>
      }
    >
      {manualRows.length === 0 ? (
        <EmptyState
          title="No manual transactions here"
          description={ws.manual_transactions.length === 0 ? `Nothing recorded on ${ws.account.name} within the statement period (± ${ws.date_tolerance_days} days).` : 'Try a different filter.'}
          className="py-8"
        />
      ) : (
        <ul className="divide-y">
          {manualRows.map((t: ManualLine) => (
            <ManualLineRow
              key={t.id}
              line={t}
              accountId={accountId}
              highlighted={highlightManual === t.id}
              onSelect={() => {
                const bankId = t.bank_transaction_id ?? bankByTx.get(t.id)
                if (bankId) focusBank(bankId)
              }}
              onFindInBank={(amount) => {
                setBankFilter('unrecorded')
                setBankSearch('')
                setBankAmount(amount)
                setColumn('bank')
              }}
              onShowDuplicate={focusManual}
              registerRef={(el) => {
                if (el) manualRefs.current.set(t.id, el)
                else manualRefs.current.delete(t.id)
              }}
            />
          ))}
        </ul>
      )}
    </ColumnShell>
  )

  const resultsColumn = (
    <ColumnShell title="Results" count={ws.summary.matched + ws.summary.transfers} total={ws.bank_transactions.length}>
      <ResultsColumn
        ws={ws}
        currency={currency}
        busy={actions.busy}
        onUnmatch={(id) => void actions.unmatch(id)}
        onJumpBank={focusBank}
        onShowUnrecorded={() => {
          setBankFilter('unrecorded')
          setBankAmount(null)
          setColumn('bank')
        }}
        onShowUnmatchedManual={() => {
          setManualFilter('unmatched')
          setColumn('manual')
        }}
      />
    </ColumnShell>
  )

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
        <Link to="/reconciliation">
          <ArrowLeft data-icon="inline-start" /> Reconciliation
        </Link>
      </Button>

      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <AccountIcon type={ws.account.type} />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight lg:text-2xl">{ws.statement.file_name}</h1>
            <p className="text-muted-foreground text-sm">
              {ws.account.name} · {rangeLabel({ from: ws.statement.period_start, to: ws.statement.period_end })}
            </p>
            <ToleranceEditor
              value={ws.date_tolerance_days}
              onSaved={() => void qc.invalidateQueries({ queryKey: keys.reconciliation.all })}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setReportOpen(true)}>
            <FileText data-icon="inline-start" /> Report
          </Button>
          <Button variant="outline" asChild>
            <Link to="/statements/$id" params={{ id: statementId }}>
              Statement
            </Link>
          </Button>
          <Button onClick={() => void actions.autoMatch(statementId)} disabled={actions.busy || ws.summary.unrecorded_bank === 0}>
            <Wand2 data-icon="inline-start" /> Auto-match
          </Button>
        </div>
      </header>

      <SummaryStrip ws={ws} currency={currency} />

      {desktop ? (
        <div className="grid grid-cols-3 gap-4">
          {manualColumn}
          {bankColumn}
          {resultsColumn}
        </div>
      ) : (
        <Tabs value={column} onValueChange={(v) => setColumn(v as Column)}>
          <TabsList className="w-full">
            <TabsTrigger value="manual">Manual {ws.summary.unmatched_manual > 0 && <Count n={ws.summary.unmatched_manual} />}</TabsTrigger>
            <TabsTrigger value="bank">Bank {ws.summary.unrecorded_bank > 0 && <Count n={ws.summary.unrecorded_bank} />}</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
          </TabsList>
          <TabsContent value="manual">{manualColumn}</TabsContent>
          <TabsContent value="bank">{bankColumn}</TabsContent>
          <TabsContent value="results">{resultsColumn}</TabsContent>
        </Tabs>
      )}

      <MatchPickerDialog
        open={dialog?.kind === 'match'}
        onOpenChange={(o) => !o && closeDialog()}
        line={dialog?.kind === 'match' ? dialog.line : null}
        candidates={unmatchedManual}
        currency={currency}
        busy={actions.busy}
        onMatch={(txId) => dialog && void actions.confirm(dialog.line.id, txId).then(after)}
        onAdjust={(txId) => dialog && void actions.adjust(dialog.line.id, txId).then(after)}
      />
      <IgnoreDialog
        open={dialog?.kind === 'ignore'}
        onOpenChange={(o) => !o && closeDialog()}
        line={dialog?.kind === 'ignore' ? dialog.line : null}
        currency={currency}
        busy={actions.busy}
        onConfirm={(note) => dialog && void actions.ignore(dialog.line.id, note || undefined).then(after)}
      />
      <MarkTransferDialog
        open={dialog?.kind === 'transfer'}
        onOpenChange={(o) => !o && closeDialog()}
        line={dialog?.kind === 'transfer' ? dialog.line : null}
        transfers={unmatchedTransfers}
        accounts={accounts}
        accountId={accountId}
        currency={currency}
        busy={actions.busy}
        onConfirm={(body) => void actions.transfer(body).then(after)}
      />
      <CreateFromBankDialog
        open={dialog?.kind === 'create'}
        onOpenChange={(o) => !o && closeDialog()}
        line={dialog?.kind === 'create' ? dialog.line : null}
        categories={categories}
        currency={currency}
        busy={actions.busy}
        onConfirm={(body) => void actions.create(body).then(after)}
      />
      <ReconciliationReportSheet open={reportOpen} onOpenChange={setReportOpen} statementId={statementId} currency={currency} />
    </div>
  )
}

function Count({ n }: { n: number }) {
  return <span className="bg-warning/15 text-warning ml-1 rounded-full px-1.5 text-[10px] font-semibold">{n}</span>
}

function ColumnShell({
  title,
  count,
  total,
  filters,
  children,
}: {
  title: string
  count: number
  total: number
  filters?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="bg-card ring-foreground/10 flex min-h-64 flex-col rounded-2xl ring-1 lg:max-h-[calc(100dvh-16rem)]">
      <div className="flex flex-col gap-2 border-b px-3 py-2.5">
        <h2 className="text-sm font-medium">
          {title}{' '}
          <span className="text-muted-foreground font-normal">
            {count === total ? total : `${count} of ${total}`}
          </span>
        </h2>
        {filters}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  )
}

function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="-mx-3 flex scrollbar-none gap-1.5 overflow-x-auto px-3" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 shrink-0 rounded-full border px-2.5 text-xs font-medium transition-colors',
            value === o.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-8 rounded-lg pl-8 text-xs" />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="text-muted-foreground absolute top-1/2 right-2 -translate-y-1/2">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

function ToleranceEditor({ value, onSaved }: { value: number; onSaved: () => void }) {
  const update = useUpdateSettings()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const save = () => {
    const n = Number(draft)
    if (!Number.isInteger(n) || n < 0 || n > 31) {
      toast.error('Tolerance must be a whole number of days between 0 and 31')
      return
    }
    update.mutate(
      { 'reconciliation.date_tolerance_days': String(n) },
      {
        onSuccess: () => {
          toast.success(`Date tolerance set to ${n} day${n === 1 ? '' : 's'}`)
          setEditing(false)
          onSaved()
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }
  if (!editing)
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(String(value))
          setEditing(true)
        }}
        className="text-muted-foreground hover:text-foreground mt-1 flex items-center gap-1 text-xs"
      >
        Date tolerance ± {value} day{value === 1 ? '' : 's'} <Pencil className="size-3" />
      </button>
    )
  return (
    <form
      className="mt-1 flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <label htmlFor="tolerance-days" className="text-muted-foreground text-xs">
        Tolerance ±
      </label>
      <Input id="tolerance-days" type="number" min={0} max={31} value={draft} onChange={(e) => setDraft(e.target.value)} className="h-7 w-16 text-xs" autoFocus />
      <span className="text-muted-foreground text-xs">days</span>
      <Button type="submit" size="icon-xs" variant="outline" disabled={update.isPending} aria-label="Save tolerance">
        <Check />
      </Button>
      <Button type="button" size="icon-xs" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel">
        <X />
      </Button>
    </form>
  )
}

function SummaryStrip({ ws, currency }: { ws: WorkspaceData; currency: string }) {
  const s = ws.summary
  const items: { label: string; value: React.ReactNode; tone?: 'ok' | 'warn' }[] = [
    { label: 'Statement debits', value: <Money minor={-s.total_debits} currency={currency} tone="expense" /> },
    { label: 'Statement credits', value: <Money minor={s.total_credits} currency={currency} tone="income" sign="always" /> },
    { label: 'Manual expenses', value: <Money minor={-s.manual_expenses} currency={currency} tone="expense" /> },
    { label: 'Manual income', value: <Money minor={s.manual_income} currency={currency} tone="income" sign="always" /> },
    { label: 'Matched', value: s.matched, tone: 'ok' },
    { label: 'Unmatched manual', value: s.unmatched_manual, tone: s.unmatched_manual ? 'warn' : 'ok' },
    { label: 'Unrecorded bank', value: s.unrecorded_bank, tone: s.unrecorded_bank ? 'warn' : 'ok' },
    { label: 'Ignored', value: s.ignored },
    { label: 'Transfers', value: s.transfers },
    { label: 'Discrepancies', value: s.amount_discrepancies, tone: s.amount_discrepancies ? 'warn' : undefined },
  ]
  return (
    <div className="-mx-4 flex scrollbar-none gap-2 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-6 lg:px-0 xl:grid-cols-11">
      {items.map((it) => (
        <div key={it.label} className="bg-card ring-foreground/10 flex min-w-32 shrink-0 flex-col rounded-xl px-3 py-2 ring-1 lg:min-w-0">
          <span className="text-muted-foreground text-[11px]">{it.label}</span>
          <span className={cn('tabular text-sm font-semibold', it.tone === 'warn' && 'text-warning', it.tone === 'ok' && 'text-income')}>{it.value}</span>
        </div>
      ))}
      <div
        className={cn(
          'flex min-w-32 shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium ring-1 lg:min-w-0',
          s.balance_verified ? 'bg-income/5 text-income ring-income/30' : 'bg-warning/5 text-warning ring-warning/30',
        )}
        title={s.balance_verified ? 'Opening + credits − debits equals the closing balance' : 'Closing balance could not be verified'}
      >
        {s.balance_verified ? <CheckCircle2 className="size-4 shrink-0" /> : <CircleAlert className="size-4 shrink-0" />}
        {s.balance_verified ? 'Balance verified' : 'Unverified'}
      </div>
    </div>
  )
}
