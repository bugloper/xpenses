import { X } from 'lucide-react'
import { DateRangePicker } from '@/components/common/DateRangePicker'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { categoryLabel, groupCategories } from '@/lib/categories'
import { rangeLabel } from '@/lib/dates'
import { useAccounts, useCategories } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { TransactionSort, TransactionStatus, TransactionType } from '@/types/api'

export type TxFilters = {
  from?: string
  to?: string
  account?: string
  category?: string
  type?: TransactionType
  status?: TransactionStatus
  sort?: TransactionSort
  order?: 'asc' | 'desc'
}

const ANY = '__any'
const sel = (v: string | undefined) => v ?? ANY

const TYPE_LABEL: Record<TransactionType, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  refund: 'Refund',
  adjustment: 'Adjustment',
}
const STATUS_LABEL: Record<TransactionStatus, string> = {
  cleared: 'Cleared',
  pending: 'Drafts',
  void: 'Void',
}

export function countActiveFilters(f: TxFilters): number {
  return [f.from, f.account, f.category, f.type, f.status].filter(Boolean).length
}

/** The account filter as a select; used in the toolbar and in the sheet. */
export function AccountFilter({
  value,
  onChange,
  className,
  id,
}: {
  value?: string
  onChange: (id: string | undefined) => void
  className?: string
  id?: string
}) {
  const { data: accounts = [] } = useAccounts(true)
  return (
    <Select value={sel(value)} onValueChange={(v) => onChange(v === ANY ? undefined : v)}>
      <SelectTrigger id={id} className={cn('w-full', className)} aria-label="Filter by account">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>All accounts</SelectItem>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
            {!a.is_active ? ' (inactive)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** The category filter: main categories with their sub-categories beneath. */
export function CategoryFilter({
  value,
  onChange,
  className,
  id,
}: {
  value?: string
  onChange: (id: string | undefined) => void
  className?: string
  id?: string
}) {
  const { data: categories = [] } = useCategories(true)
  return (
    <Select value={sel(value)} onValueChange={(v) => onChange(v === ANY ? undefined : v)}>
      <SelectTrigger id={id} className={cn('w-full', className)} aria-label="Filter by category">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>All categories</SelectItem>
        {(['expense', 'income'] as const).flatMap((t) =>
          groupCategories(categories, t, { includeInactive: true }).map((g) => (
            <SelectGroup key={g.parent.id}>
              <SelectLabel>
                {g.parent.name} · {t}
              </SelectLabel>
              <SelectItem value={g.parent.id}>
                {g.children.length > 0 ? `All ${g.parent.name}` : g.parent.name}
              </SelectItem>
              {g.children.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectGroup>
          )),
        )}
      </SelectContent>
    </Select>
  )
}

/**
 * The filters in force, as small removable tags. On wide screens the date,
 * account and category already show in the toolbar, so only the rest appear.
 */
export function ActiveFilters({
  value,
  onChange,
  hideType,
}: {
  value: TxFilters
  onChange: (next: TxFilters) => void
  hideType?: boolean
}) {
  const { data: accounts = [] } = useAccounts(true)
  const { data: categories = [] } = useCategories(true)
  const set = (patch: Partial<TxFilters>) => onChange({ ...value, ...patch })
  const tags: { key: string; label: string; clear: () => void; inToolbar?: boolean }[] = []
  if (value.from && value.to)
    tags.push({
      key: 'date',
      label: rangeLabel({ from: value.from, to: value.to }),
      clear: () => set({ from: undefined, to: undefined }),
      inToolbar: true,
    })
  if (value.account)
    tags.push({
      key: 'account',
      label: accounts.find((a) => a.id === value.account)?.name ?? 'Account',
      clear: () => set({ account: undefined }),
      inToolbar: true,
    })
  if (value.category)
    tags.push({
      key: 'category',
      label: categoryLabel(categories, value.category) || 'Category',
      clear: () => set({ category: undefined }),
      inToolbar: true,
    })
  if (value.type && !hideType)
    tags.push({ key: 'type', label: TYPE_LABEL[value.type], clear: () => set({ type: undefined }) })
  if (value.status)
    tags.push({ key: 'status', label: STATUS_LABEL[value.status], clear: () => set({ status: undefined }) })
  if (tags.length === 0) return null
  const onlyToolbar = tags.every((t) => t.inToolbar)
  return (
    <div className={cn('flex items-center gap-2', onlyToolbar && 'lg:hidden')}>
      <span className="eyebrow shrink-0 max-sm:hidden">Showing</span>
      <div className="no-scrollbar -my-1 flex flex-1 gap-1.5 overflow-x-auto py-1">
        {tags.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={t.clear}
            aria-label={`Remove filter: ${t.label}`}
            className={cn(
              'bg-card hover:border-foreground/30 flex h-7 shrink-0 items-center gap-1.5 rounded-md border pr-1.5 pl-2.5 text-xs font-medium transition-colors',
              t.inToolbar && 'lg:hidden',
            )}
          >
            {t.label}
            <X className="text-muted-foreground size-3.5" />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange({ sort: value.sort, order: value.order })}
        className="text-muted-foreground hover:text-foreground shrink-0 text-xs font-medium underline-offset-4 hover:underline"
      >
        Clear all
      </button>
    </div>
  )
}

export function TransactionFiltersSheet({
  open,
  onOpenChange,
  value,
  onChange,
  hideType,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  value: TxFilters
  onChange: (next: TxFilters) => void
  hideType?: boolean
}) {
  const set = (patch: Partial<TxFilters>) => onChange({ ...value, ...patch })

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => onChange({ sort: value.sort, order: value.order })}>
            Clear all
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Field>
          <FieldLabel>Date range</FieldLabel>
          <DateRangePicker
            value={value.from && value.to ? { from: value.from, to: value.to } : null}
            onChange={(r) => set({ from: r?.from, to: r?.to })}
            className="h-10 w-full"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="filter-account">Account</FieldLabel>
          <AccountFilter id="filter-account" value={value.account} onChange={(account) => set({ account })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="filter-category">Category</FieldLabel>
          <CategoryFilter
            id="filter-category"
            value={value.category}
            onChange={(category) => set({ category })}
          />
        </Field>
        {!hideType && (
          <Field>
            <FieldLabel>Type</FieldLabel>
            <Select
              value={sel(value.type)}
              onValueChange={(v) => set({ type: v === ANY ? undefined : (v as TransactionType) })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All types</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
                <SelectItem value="refund">Refund</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field>
          <FieldLabel>Status</FieldLabel>
          <Select
            value={sel(value.status)}
            onValueChange={(v) => set({ status: v === ANY ? undefined : (v as TransactionStatus) })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Cleared & drafts</SelectItem>
              <SelectItem value="cleared">Cleared</SelectItem>
              <SelectItem value="pending">Drafts (pending)</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3 border-t pt-5">
          <Field>
            <FieldLabel>Sort by</FieldLabel>
            <Select value={value.sort ?? 'date'} onValueChange={(v) => set({ sort: v as TransactionSort })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="amount">Amount</SelectItem>
                <SelectItem value="created_at">Created</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Order</FieldLabel>
            <Select value={value.order ?? 'desc'} onValueChange={(v) => set({ order: v as 'asc' | 'desc' })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Newest first</SelectItem>
                <SelectItem value="asc">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>
    </ResponsiveSheet>
  )
}
