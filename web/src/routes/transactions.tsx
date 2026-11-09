import { createRoute } from '@tanstack/react-router'
import { Download, Search, SlidersHorizontal, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { Segmented } from '@/components/common/Segmented'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AccountFilter,
  ActiveFilters,
  CategoryFilter,
  TransactionFiltersSheet,
  countActiveFilters,
  type TxFilters,
} from '@/components/transactions/TransactionFilters'
import { DateRangePicker } from '@/components/common/DateRangePicker'
import { TransactionList } from '@/components/transactions/TransactionList'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { downloadFile, errorMessage, toQuery } from '@/lib/api'
import { usePendingTransactions } from '@/lib/offline'
import { useDefaultCurrency, useInfiniteTransactions } from '@/lib/queries'
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
          <Button variant="outline" size="sm" onClick={() => void exportCsv()} aria-label="Export CSV">
            <Download data-icon="inline-start" /> <span className="hidden sm:inline">Export CSV</span>
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {searchBox}
          <Button
            variant="outline"
            className="relative h-10 shrink-0 lg:order-last"
            onClick={() => setFiltersOpen(true)}
            aria-label={activeCount ? `Filters, ${activeCount} on` : 'Filters'}
          >
            <SlidersHorizontal data-icon="inline-start" />{' '}
            <span className="max-sm:sr-only lg:sr-only xl:not-sr-only">Filters</span>
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
            className="max-lg:w-full"
            onChange={(v) =>
              void navigate({ search: (s) => ({ ...s, tab: v === 'all' ? undefined : v }), replace: true })
            }
            options={[
              { value: 'all', label: 'All' },
              { value: 'income', label: 'Income', tone: 'income' },
              { value: 'expense', label: 'Expense', tone: 'expense' },
            ]}
          />
          {/* Wide screens keep the common filters in the toolbar; the sheet holds the rest. */}
          <DateRangePicker
            value={filters.from && filters.to ? { from: filters.from, to: filters.to } : null}
            onChange={(r) => setFilters({ ...filters, from: r?.from, to: r?.to })}
            placeholder="Any date"
            className="hidden h-10 w-44 lg:inline-flex"
          />
          <div className="hidden lg:block">
            <AccountFilter
              value={filters.account}
              onChange={(account) => setFilters({ ...filters, account })}
              className="h-10! w-40"
            />
          </div>
          <div className="hidden lg:block">
            <CategoryFilter
              value={filters.category}
              onChange={(category) => setFilters({ ...filters, category })}
              className="h-10! w-44"
            />
          </div>
        </div>
        <ActiveFilters value={filters} onChange={setFilters} hideType={tab !== 'all'} />
      </div>
      <TransactionList
        columns
        groups={groups}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        hasMore={query.hasNextPage}
        loadingMore={query.isFetchingNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        currency={currency}
        emptyTitle={activeCount || search.q ? 'Nothing matches' : 'No transactions yet'}
        emptyDescription={
          activeCount || search.q ? 'Try widening your filters.' : 'Tap + to add your first expense.'
        }
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
