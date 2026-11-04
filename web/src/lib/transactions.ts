import type { PendingTransaction } from '@/lib/offline/queue'
import { signedAmount } from '@/lib/money'
import type { Transaction } from '@/types/api'

/** A row in the transactions list: either a server transaction or an offline-queued one. */
export type ListRow =
  { kind: 'tx'; tx: Transaction } | { kind: 'pending'; item: PendingTransaction; tx: Transaction }

export type DayGroup = {
  date: string
  rows: ListRow[]
  /** Net of income/refund minus expense for the day (transfers/adjustments excluded). */
  net: number
  income: number
  expense: number
}

/** Shape a queued payload as a Transaction so list rows can render it uniformly. */
export function pendingToTransaction(item: PendingTransaction): Transaction {
  const p = item.payload
  return {
    id: `pending:${item.client_id}`,
    type: p.type,
    amount: p.amount,
    currency: p.currency ?? 'BTN',
    account_id: p.account_id,
    transfer_account_id: p.transfer_account_id ?? null,
    category_id: p.category_id ?? null,
    description: p.description ?? '',
    payee: p.payee ?? '',
    transaction_date: p.transaction_date,
    notes: p.notes ?? '',
    origin: 'manual',
    status: p.status ?? 'cleared',
    recurring_id: null,
    source_bank_transaction_id: null,
    client_id: item.client_id,
    tags: p.tags ?? [],
    created_at: item.created_at,
    updated_at: item.updated_at,
  }
}

export function dayContribution(tx: Transaction): number {
  if (tx.status !== 'cleared') return 0
  switch (tx.type) {
    case 'expense':
      return -tx.amount
    case 'income':
    case 'refund':
      return tx.amount
    default:
      return 0
  }
}

/**
 * Groups rows by `transaction_date` (desc) and computes per-day totals.
 * Pending (offline) items are merged in and sorted alongside server rows.
 */
export function groupByDay(
  transactions: Transaction[],
  pending: PendingTransaction[] = [],
  opts: { order?: 'asc' | 'desc' } = {},
): DayGroup[] {
  const order = opts.order ?? 'desc'
  const rows: ListRow[] = [
    ...pending.map((item): ListRow => ({ kind: 'pending', item, tx: pendingToTransaction(item) })),
    ...transactions.map((tx): ListRow => ({ kind: 'tx', tx })),
  ]
  const byDate = new Map<string, ListRow[]>()
  for (const row of rows) {
    const list = byDate.get(row.tx.transaction_date) ?? []
    list.push(row)
    byDate.set(row.tx.transaction_date, list)
  }
  const dates = Array.from(byDate.keys()).sort((a, b) =>
    order === 'desc' ? b.localeCompare(a) : a.localeCompare(b),
  )
  return dates.map((date) => {
    const dayRows = byDate.get(date)!
    // pending first within a day, then newest created first
    dayRows.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'pending' ? -1 : 1
      return b.tx.created_at.localeCompare(a.tx.created_at)
    })
    let income = 0
    let expense = 0
    for (const r of dayRows) {
      const c = dayContribution(r.tx)
      if (c > 0) income += c
      else expense += -c
    }
    return { date, rows: dayRows, income, expense, net: income - expense }
  })
}

/** Signed amount for display, with the account perspective for transfers. */
export function displayAmount(tx: Transaction, perspectiveAccountId?: string): number {
  if (tx.type === 'transfer' && perspectiveAccountId) {
    return tx.transfer_account_id === perspectiveAccountId ? tx.amount : -tx.amount
  }
  return signedAmount(tx.type, tx.amount)
}

export function transactionTitle(tx: Transaction): string {
  if (tx.type === 'transfer')
    return `${tx.account_name ?? 'Account'} → ${tx.transfer_account_name ?? 'Account'}`
  return (
    tx.payee ||
    tx.description ||
    tx.category_name ||
    (tx.type === 'adjustment' ? 'Adjustment' : 'Transaction')
  )
}

export function transactionSubtitle(tx: Transaction): string {
  if (tx.type === 'transfer') return tx.description || 'Transfer'
  const parts: string[] = []
  if (tx.payee && tx.description) parts.push(tx.description)
  if (tx.account_name) parts.push(tx.account_name)
  return parts.join(' · ')
}
