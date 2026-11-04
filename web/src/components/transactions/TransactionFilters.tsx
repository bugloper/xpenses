import { DateRangePicker } from '@/components/common/DateRangePicker'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAccounts, useCategories } from '@/lib/queries'
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

export function countActiveFilters(f: TxFilters): number {
  return [f.from, f.account, f.category, f.type, f.status].filter(Boolean).length
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
  const { data: accounts = [] } = useAccounts(true)
  const { data: categories = [] } = useCategories(true)
  const set = (patch: Partial<TxFilters>) => onChange({ ...value, ...patch })
  const sel = (v: string | undefined) => v ?? ANY

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
            className="w-full"
          />
        </Field>
        <Field>
          <FieldLabel>Account</FieldLabel>
          <Select
            value={sel(value.account)}
            onValueChange={(v) => set({ account: v === ANY ? undefined : v })}
          >
            <SelectTrigger className="w-full">
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
        </Field>
        <Field>
          <FieldLabel>Category</FieldLabel>
          <Select
            value={sel(value.category)}
            onValueChange={(v) => set({ category: v === ANY ? undefined : v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} · {c.type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <div className="grid grid-cols-2 gap-3">
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
                <SelectItem value="payee">Payee</SelectItem>
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
