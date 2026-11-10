import { describe, expect, it } from 'vitest'
import { groupByDay, pendingToTransaction, transactionTitle, transactionsSearchSchema } from './transactions'
import type { PendingTransaction } from './offline/queue'
import type { Transaction } from '@/types/api'

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'expense',
    amount: 100,
    currency: 'BTN',
    account_id: 'a',
    transfer_account_id: null,
    category_id: null,
    description: '',
    payee: '',
    transaction_date: '2026-11-04',
    notes: '',
    origin: 'manual',
    status: 'cleared',
    recurring_id: null,
    has_attachment: false,
    receipt: null,
    tags: [],
    created_at: '2026-11-04T10:00:00Z',
    updated_at: '2026-11-04T10:00:00Z',
    ...partial,
  }
}

describe('groupByDay', () => {
  it('groups by date descending with per-day totals', () => {
    const groups = groupByDay([
      tx({ transaction_date: '2026-11-03', type: 'expense', amount: 500 }),
      tx({ transaction_date: '2026-11-04', type: 'income', amount: 250000 }),
      tx({ transaction_date: '2026-11-04', type: 'expense', amount: 8540 }),
      tx({ transaction_date: '2026-11-04', type: 'transfer', amount: 99999 }),
      tx({ transaction_date: '2026-11-04', type: 'expense', amount: 777, status: 'pending' }),
    ])
    expect(groups.map((g) => g.date)).toEqual(['2026-11-04', '2026-11-03'])
    expect(groups[0]).toMatchObject({ income: 250000, expense: 8540, net: 241460 })
    expect(groups[0]?.rows).toHaveLength(4)
    expect(groups[1]).toMatchObject({ income: 0, expense: 500, net: -500 })
  })

  it('merges pending offline items first within their day', () => {
    const pending: PendingTransaction = {
      client_id: 'c1',
      user_id: 'u1',
      payload: { type: 'expense', amount: 1000, account_id: 'a', transaction_date: '2026-11-04' },
      status: 'pending',
      attempts: 0,
      last_error: null,
      error_code: null,
      created_at: '2026-11-04T09:00:00Z',
      updated_at: '2026-11-04T09:00:00Z',
      next_attempt_at: 0,
    }
    const groups = groupByDay([tx({ created_at: '2026-11-04T12:00:00Z' })], [pending])
    expect(groups[0]?.rows[0]?.kind).toBe('pending')
    expect(groups[0]?.rows[0]?.tx.id).toBe('pending:c1')
    expect(groups[0]?.expense).toBe(1100)
  })

  it('drops a pending row once the server list already carries its client_id', () => {
    // The POST reached the server but the response was lost: the server row and
    // the queued copy share a client_id and must not both be shown.
    const pending: PendingTransaction = {
      client_id: 'c-lost',
      user_id: 'u1',
      payload: { type: 'expense', amount: 1000, account_id: 'a', transaction_date: '2026-11-04' },
      status: 'pending',
      attempts: 1,
      last_error: null,
      error_code: null,
      created_at: '2026-11-04T09:00:00Z',
      updated_at: '2026-11-04T09:00:00Z',
      next_attempt_at: 0,
    }
    const groups = groupByDay([tx({ amount: 1000, client_id: 'c-lost' })], [pending])
    expect(groups[0]?.rows).toHaveLength(1)
    expect(groups[0]?.rows[0]?.kind).toBe('tx')
    expect(groups[0]?.expense).toBe(1000)
    // A different client_id is still merged in.
    const other = groupByDay([tx({ amount: 1000, client_id: 'c-other' })], [pending])
    expect(other[0]?.rows).toHaveLength(2)
  })

  it('supports ascending order', () => {
    const groups = groupByDay(
      [tx({ transaction_date: '2026-11-01' }), tx({ transaction_date: '2026-11-02' })],
      [],
      { order: 'asc' },
    )
    expect(groups.map((g) => g.date)).toEqual(['2026-11-01', '2026-11-02'])
  })
})

describe('transactionsSearchSchema', () => {
  it('keeps valid keys as the drill-down links write them', () => {
    expect(
      transactionsSearchSchema.parse({
        category: 'cat-1',
        from: '2026-11-01',
        to: '2026-11-30',
        tab: 'expense',
        q: 'Cafe',
      }),
    ).toEqual({ category: 'cat-1', from: '2026-11-01', to: '2026-11-30', tab: 'expense', q: 'Cafe' })
  })

  it('drops garbage instead of crashing or forwarding it to the API', () => {
    const parsed = transactionsSearchSchema.parse({
      page: 'abc',
      from: 'yesterday',
      to: '2026-11-30',
      tab: 'nope',
      type: 'gift',
      status: 42,
      sort: 'x',
      order: 'sideways',
    })
    expect(parsed).toEqual({ to: '2026-11-30' })
    expect(transactionsSearchSchema.parse({ from: ['2026-11-01'] })).toEqual({})
  })
})

describe('pendingToTransaction', () => {
  it('fills defaults', () => {
    const t = pendingToTransaction({
      client_id: 'x',
      user_id: 'u1',
      payload: { type: 'income', amount: 5, account_id: 'a', transaction_date: '2026-01-01' },
      status: 'pending',
      attempts: 0,
      last_error: null,
      error_code: null,
      created_at: '',
      updated_at: '',
      next_attempt_at: 0,
    })
    expect(t).toMatchObject({ id: 'pending:x', currency: 'BTN', status: 'cleared', tags: [], payee: '' })
  })
})

describe('transactionTitle', () => {
  it('prefers payee, then description, then category', () => {
    expect(transactionTitle(tx({ payee: 'Cafe', description: 'Lunch' }))).toBe('Cafe')
    expect(transactionTitle(tx({ description: 'Lunch' }))).toBe('Lunch')
    expect(transactionTitle(tx({ category_name: 'Food' }))).toBe('Food')
    expect(transactionTitle(tx({ type: 'transfer', account_name: 'A', transfer_account_name: 'B' }))).toBe(
      'A → B',
    )
  })
})

describe('loans and refunds in the ledger', () => {
  it('leaves loan movements out of the day totals and takes refunds off spending', () => {
    const [day] = groupByDay([
      tx({ type: 'expense', amount: 5000 }),
      tx({ type: 'refund', amount: 1200 }),
      tx({ type: 'loan_given', amount: 100000, loan_id: 'l' }),
      tx({ type: 'loan_repayment_received', amount: 40000, loan_id: 'l' }),
      tx({ type: 'income', amount: 300, loan_id: 'l' }),
    ])
    expect(day).toMatchObject({ income: 300, expense: 3800, net: -3500 })
  })

  it('names a loan movement by what happened and with whom', () => {
    const t = (type: Transaction['type']) => transactionTitle(tx({ type, loan_counterparty: 'Pema' }))
    expect(t('loan_given')).toBe('Lent to Pema')
    expect(t('loan_received')).toBe('Borrowed from Pema')
    expect(t('loan_repayment')).toBe('Repaid Pema')
    expect(t('loan_repayment_received')).toBe('Repaid by Pema')
  })
})
