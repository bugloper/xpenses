import { createRoute } from '@tanstack/react-router'
import { CheckSquare, Download, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { PageHeader } from '@/components/common/PageHeader'
import { Segmented } from '@/components/common/Segmented'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ActiveFilters,
  TransactionFiltersSheet,
  countActiveFilters,
  type TxFilters,
} from '@/components/transactions/TransactionFilters'
import { TransactionList, type ListSelection } from '@/components/transactions/TransactionList'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { downloadFile, errorMessage, toQuery } from '@/lib/api'
import { usePendingTransactions } from '@/lib/offline'
import { useBulkDeleteTransactions, useDefaultCurrency, useInfiniteTransactions } from '@/lib/queries'
import { groupByDay, transactionsSearchSchema } from '@/lib/transactions'
import type { TransactionFilter } from '@/types/api'
import { appRoute } from './__root'

export type { TransactionsSearch } from '@/lib/transactions'

function TransactionsPage() {
  const search = transactionsRoute.useSearch()
  const navigate = transactionsRoute.useNavigate()
  const currency = useDefaultCurrency()
  const [q, setQ] = useState(search.q ?? '')
  const debouncedQ = useDebouncedValue(q, 300)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const pending = usePendingTransactions()

  useEffect(() => {
    if ((debouncedQ || undefined) !== search.q) {
      void navigate({ search: (s) => ({ ...s, q: debouncedQ || undefined }), replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ])

  const tab = search.tab ?? 'all'
  const filters = useMemo<TxFilters>(
    () => ({
      from: search.from,
      to: search.to,
      account: search.account,
      category: search.category,
      type: search.type,
      status: search.status,
      sort: search.sort,
      order: search.order,
    }),
    [
      search.from,
      search.to,
      search.account,
      search.category,
      search.type,
      search.status,
      search.sort,
      search.order,
    ],
  )
  const setFilters = (f: TxFilters) =>
    void navigate({
      search: (s) => ({
        ...s,
        ...f,
        from: f.from,
        to: f.to,
        account: f.account,
        category: f.category,
        type: f.type,
        status: f.status,
      }),
      replace: true,
    })

  const apiFilter: Omit<TransactionFilter, 'page'> = useMemo(
    () => ({
      search: search.q,
      date_from: filters.from,
      date_to: filters.to,
      account_id: filters.account,
      category_id: filters.category,
      type: tab === 'all' ? filters.type : tab,
      status: filters.status,
      sort: filters.sort ?? 'date',
      order: filters.order ?? 'desc',
    }),
    [search.q, filters, tab],
  )

  const query = useInfiniteTransactions(apiFilter, 50)
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data])

  // Selection mode: tick rows, then delete them together. The selection only
  // ever holds rows on screen, so it resets whenever the filters change.
  const [selecting, setSelecting] = useState(false)
  const filterKey = JSON.stringify(apiFilter)
  const [pickedState, setPickedState] = useState<{ key: string; ids: ReadonlySet<string> }>(() => ({
    key: filterKey,
    ids: new Set(),
  }))
  const picked = useMemo(
    () => (pickedState.key === filterKey ? pickedState.ids : new Set<string>()),
    [pickedState, filterKey],
  )
  const setPicked = useCallback(
    (next: ReadonlySet<string> | ((prev: ReadonlySet<string>) => ReadonlySet<string>)) =>
      setPickedState((s) => {
        const prev = s.key === filterKey ? s.ids : new Set<string>()
        return { key: filterKey, ids: typeof next === 'function' ? next(prev) : next }
      }),
    [filterKey],
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const bulkDelete = useBulkDeleteTransactions()
  const loadedIds = useMemo(() => rows.map((r) => r.id), [rows])
  const selection = useMemo<ListSelection>(
    () => ({
      ids: picked,
      toggle: (id) =>
        setPicked((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        }),
      setMany: (ids, on) =>
        setPicked((prev) => {
          const next = new Set(prev)
          for (const id of ids) {
            if (on) next.add(id)
            else next.delete(id)
          }
          return next
        }),
    }),
    [picked, setPicked],
  )
  const stopSelecting = useCallback(() => {
    setSelecting(false)
    setPicked(new Set())
  }, [setPicked])
  useEffect(() => {
    if (!selecting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmDelete) stopSelecting()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting, confirmDelete, stopSelecting])
  const allLoadedPicked = loadedIds.length > 0 && loadedIds.every((id) => picked.has(id))
  const deleteSelected = async () => {
    const ids = [...picked]
    try {
      const { deleted } = await bulkDelete.mutateAsync(ids)
      toast.success(`${deleted} ${deleted === 1 ? 'transaction' : 'transactions'} deleted`)
      stopSelecting()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not delete'))
      throw e
    }
  }
  const total = query.data?.pages[0]?.meta.total ?? 0

  // Merge offline-queued items (only on the unfiltered first view so they aren't mis-filtered).
  const visiblePending = useMemo(() => {
    if (search.q || filters.from || filters.to || filters.account || filters.category || filters.status)
      return []
    const wantType = tab === 'all' ? filters.type : tab
    return pending.filter((p) => !wantType || p.payload.type === wantType)
  }, [pending, search.q, filters, tab])

  const groups = useMemo(
    () =>
      groupByDay(rows, visiblePending, {
        order: (filters.sort ?? 'date') === 'date' ? (filters.order ?? 'desc') : 'desc',
      }),
    [rows, visiblePending, filters.sort, filters.order],
  )

  const activeCount = countActiveFilters(filters)
  const exportCsv = useCallback(async () => {
    const qs = toQuery({
      search: apiFilter.search,
      date_from: apiFilter.date_from,
      date_to: apiFilter.date_to,
      account_id: apiFilter.account_id,
      category_id: apiFilter.category_id,
      type: apiFilter.type,
      status: apiFilter.status,
      sort: apiFilter.sort,
      order: apiFilter.order,
    })
    try {
      await downloadFile(`/transactions/export.csv${qs}`, 'transactions.csv')
      toast.success('CSV downloaded')
    } catch (e) {
      toast.error(errorMessage(e, 'Export failed'))
    }
  }, [apiFilter])

  const searchBox = (
    <div className="relative min-w-0 flex-1 basis-48">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search payee, description, reference"
        className="h-10 pr-9 pl-9"
        aria-label="Search transactions"
      />
      {q && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setQ('')}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Ledger"
        title="Transactions"
        description={
          total
            ? `${total.toLocaleString()} ${total === 1 ? 'entry' : 'entries'}${activeCount || search.q ? ' match' : ''}`
            : undefined
        }
        actions={
          <>
            <Button
              variant={selecting ? 'default' : 'outline'}
              size="sm"
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
              disabled={!selecting && loadedIds.length === 0}
              aria-pressed={selecting}
            >
              <CheckSquare data-icon="inline-start" /> {selecting ? 'Done' : 'Select'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void exportCsv()} aria-label="Export CSV">
              <Download data-icon="inline-start" /> <span className="hidden sm:inline">Export CSV</span>
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {searchBox}
          <Button
            variant="outline"
            className="relative h-10 shrink-0"
            onClick={() => setFiltersOpen(true)}
            aria-label={activeCount ? `Filters, ${activeCount} on` : 'Filters'}
          >
            <SlidersHorizontal data-icon="inline-start" /> <span className="max-sm:sr-only">Filters</span>
            {activeCount > 0 && (
              <span className="bg-saffron text-saffron-foreground flex h-4.5 min-w-4.5 items-center justify-center rounded-sm px-1 font-mono text-[0.625rem] font-semibold">
                {activeCount}
              </span>
            )}
          </Button>
          <Segmented
            aria-label="Type"
            value={tab}
            size="lg"
            className="w-full basis-full sm:w-full"
            onChange={(v) =>
              void navigate({ search: (s) => ({ ...s, tab: v === 'all' ? undefined : v }), replace: true })
            }
            options={[
              { value: 'all', label: 'All' },
              { value: 'income', label: 'Income', tone: 'income' },
              { value: 'expense', label: 'Expense', tone: 'expense' },
            ]}
          />
        </div>
        <ActiveFilters value={filters} onChange={setFilters} hideType={tab !== 'all'} />
      </div>
      <TransactionList
        groups={groups}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        hasMore={query.hasNextPage}
        loadingMore={query.isFetchingNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        currency={currency}
        selection={selecting ? selection : undefined}
        className={selecting ? 'mb-20' : undefined}
        emptyTitle={activeCount || search.q ? 'Nothing matches' : 'No transactions yet'}
        emptyDescription={
          activeCount || search.q ? 'Try widening your filters.' : 'Tap + to add your first expense.'
        }
      />
      {selecting && (
        <div
          role="toolbar"
          aria-label="Selected transactions"
          className="bg-ink text-ink-foreground fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-2xl items-center gap-2 rounded-lg p-2 pl-4 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.5)] lg:bottom-6 lg:left-[calc(15rem+0.75rem)]"
        >
          <span className="min-w-0 flex-1 text-sm" aria-live="polite">
            <span className="figure text-lg">{picked.size}</span>{' '}
            <span className="text-ink-muted">selected</span>
          </span>
          <button
            type="button"
            onClick={() => selection.setMany(loadedIds, !allLoadedPicked)}
            className="text-ink-foreground/85 hover:bg-ink-foreground/10 h-9 rounded-md px-2.5 text-sm font-medium"
          >
            {allLoadedPicked ? 'Clear' : `All ${loadedIds.length}`}
          </button>
          <button
            type="button"
            onClick={stopSelecting}
            className="text-ink-foreground/85 hover:bg-ink-foreground/10 h-9 rounded-md px-2.5 text-sm font-medium"
          >
            Cancel
          </button>
          <Button
            variant="destructive"
            className="bg-destructive hover:bg-destructive/90 h-9 text-white"
            disabled={picked.size === 0 || bulkDelete.isPending}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 data-icon="inline-start" /> Delete
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        destructive
        title={`Delete ${picked.size} ${picked.size === 1 ? 'transaction' : 'transactions'}?`}
        description="They are removed for good, with any screenshots attached to them. Balances, budgets and reports update straight away."
        confirmLabel="Delete"
        loading={bulkDelete.isPending}
        onConfirm={deleteSelected}
      />
      <TransactionFiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        value={filters}
        onChange={setFilters}
        hideType={tab !== 'all'}
      />
    </div>
  )
}

export const transactionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/transactions',
  validateSearch: transactionsSearchSchema,
  component: TransactionsPage,
})
