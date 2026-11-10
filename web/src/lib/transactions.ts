import { z } from 'zod'
import type { PendingTransaction } from '@/lib/offline/queue'
import { signedAmount } from '@/lib/money'
import { LOAN_TYPES, type LoanDirection, type LoanTransactionType, type Transaction } from '@/types/api'

const isoDate = () =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined)

/**
 * `/transactions?…` search params. Every key tolerates garbage (`?page=abc`,
 * `?from=yesterday`) by dropping it instead of crashing or forwarding it to the
 * API, where a malformed date would turn the whole list into an error state.
 */
export const transactionsSearchSchema = z.object({
  tab: z.enum(['all', 'income', 'expense']).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  from: isoDate(),
  to: isoDate(),
  account: z.string().optional().catch(undefined),
  category: z.string().optional().catch(undefined),
  type: z
    .enum([
      'expense',
      'income',
      'transfer',
      'refund',
      'adjustment',
      'loan_given',
      'loan_received',
      'loan_repayment',
      'loan_repayment_received',
      'loan',
    ])
    .optional()
    .catch(undefined),
  status: z.enum(['cleared', 'pending', 'void']).optional().catch(undefined),
  sort: z.enum(['date', 'amount', 'created_at', 'payee']).optional().catch(undefined),
  order: z.enum(['asc', 'desc']).optional().catch(undefined),
})
export type TransactionsSearch = z.infer<typeof transactionsSearchSchema>

/** A row in the transactions list: either a server transaction or an offline-queued one. */
export type ListRow =
  { kind: 'tx'; tx: Transaction } | { kind: 'pending'; item: PendingTransaction; tx: Transaction }

export type DayGroup = {
  date: string
  rows: ListRow[]
  /** Income less spending (net of refunds) for the day; transfers, loans and adjustments excluded. */
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
    has_attachment: false,
    receipt: null,
    client_id: item.client_id,
    tags: p.tags ?? [],
    loan_id: p.loan_id ?? null,
    loan_counterparty: p.new_loan?.counterparty,
    created_at: item.created_at,
    updated_at: item.updated_at,
  }
}

/** Picked in the loan field to start a new loan instead of adding to one. */
export const NEW_LOAN = '__new'

export function isLoanType(type: string): type is LoanTransactionType {
  return (LOAN_TYPES as string[]).includes(type)
}

/** Lending and being repaid are loans given; borrowing and repaying, loans received. */
export function loanDirection(type: LoanTransactionType): LoanDirection {
  return type === 'loan_given' || type === 'loan_repayment_received' ? 'given' : 'received'
}

/** Short names for the loan movements, as the form's options and the ledger's labels. */
export const LOAN_LABELS: Record<LoanTransactionType, string> = {
  loan_given: 'Lent',
  loan_received: 'Borrowed',
  loan_repayment: 'Repaid',
  loan_repayment_received: 'Repaid to you',
}

/**
 * A transaction's part in the day's income and expenses: income counts in,
 * spending out, and a refund gives spending back. Transfers, loan movements
 * and adjustments are neither.
 */
export function dayFlows(tx: Transaction): { income: number; expense: number } {
  if (tx.status !== 'cleared') return { income: 0, expense: 0 }
  switch (tx.type) {
    case 'income':
      return { income: tx.amount, expense: 0 }
    case 'expense':
      return { income: 0, expense: tx.amount }
    case 'refund':
      return { income: 0, expense: -tx.amount }
    default:
      return { income: 0, expense: 0 }
  }
}

/**
 * Groups rows by `transaction_date` (desc) and computes per-day totals.
 * Pending (offline) items are merged in and sorted alongside server rows.
 * A pending item whose `client_id` already appears on a server row is dropped:
 * the POST reached the server but its response was lost, so the retry will be
 * a no-op and showing both would double-count it.
 */
export function groupByDay(
  transactions: Transaction[],
  pending: PendingTransaction[] = [],
  opts: { order?: 'asc' | 'desc' } = {},
): DayGroup[] {
  const order = opts.order ?? 'desc'
  const synced = new Set<string>()
  for (const tx of transactions) if (tx.client_id) synced.add(tx.client_id)
  const rows: ListRow[] = [
    ...pending
      .filter((item) => !synced.has(item.client_id))
      .map((item): ListRow => ({ kind: 'pending', item, tx: pendingToTransaction(item) })),
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
      const f = dayFlows(r.tx)
      income += f.income
      expense += f.expense
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

export type TitleFields = Pick<
  Transaction,
  'type' | 'account_name' | 'transfer_account_name' | 'payee' | 'description' | 'category_name'
> &
  Partial<Pick<Transaction, 'loan_counterparty'>>

/** What a loan movement did, in a few words: "Lent to Pema", "Repaid by Pema". */
export function loanTitle(type: LoanTransactionType, who?: string): string {
  const name = who || 'someone'
  switch (type) {
    case 'loan_given':
      return `Lent to ${name}`
    case 'loan_received':
      return `Borrowed from ${name}`
    case 'loan_repayment':
      return `Repaid ${name}`
    case 'loan_repayment_received':
      return `Repaid by ${name}`
  }
}

export function transactionTitle(tx: TitleFields): string {
  if (tx.type === 'transfer')
    return `${tx.account_name ?? 'Account'} → ${tx.transfer_account_name ?? 'Account'}`
  if (isLoanType(tx.type)) return loanTitle(tx.type, tx.loan_counterparty)
  return (
    tx.payee ||
    tx.description ||
    tx.category_name ||
    (tx.type === 'adjustment' ? 'Adjustment' : 'Transaction')
  )
}

export function transactionSubtitle(tx: TitleFields): string {
  if (tx.type === 'transfer') return tx.description || 'Transfer'
  const parts: string[] = []
  if (tx.payee && tx.description) parts.push(tx.description)
  if (tx.account_name) parts.push(tx.account_name)
  return parts.join(' · ')
}

/** The glyph a transaction shows instead of a category icon, if any. */
export function specialKind(type: string): 'transfer' | 'adjustment' | 'loan' | undefined {
  if (type === 'transfer') return 'transfer'
  if (type === 'adjustment') return 'adjustment'
  if (isLoanType(type)) return 'loan'
  return undefined
}
