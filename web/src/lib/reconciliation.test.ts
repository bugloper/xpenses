import { describe, expect, it } from 'vitest'
import type { Suggestion, Transaction } from '@/types/api'
import {
  bankSide,
  confidenceTone,
  dateDiffDays,
  manualSide,
  matchesSearch,
  rankManualCandidates,
  rejectKey,
  ruleLabel,
  sortSuggestions,
} from './reconciliation'

const tx = (over: Partial<Transaction> & { id: string }): Transaction => ({
  type: 'expense',
  amount: 100,
  currency: 'BTN',
  account_id: 'acc',
  transfer_account_id: null,
  category_id: null,
  description: '',
  payee: '',
  transaction_date: '2026-11-04',
  notes: '',
  origin: 'manual',
  status: 'cleared',
  recurring_id: null,
  source_bank_transaction_id: null,
  tags: [],
  created_at: '',
  updated_at: '',
  ...over,
})

const sug = (over: Partial<Suggestion> & { transaction_id: string }): Suggestion => ({
  transaction: null,
  rule: 'exact_date',
  confidence: 50,
  amount_diff: 0,
  date_diff_days: 0,
  reason: '',
  ...over,
})

describe('confidenceTone', () => {
  it('buckets by threshold', () => {
    expect(confidenceTone(100)).toBe('high')
    expect(confidenceTone(85)).toBe('high')
    expect(confidenceTone(84)).toBe('medium')
    expect(confidenceTone(60)).toBe('medium')
    expect(confidenceTone(59)).toBe('low')
    expect(confidenceTone(0)).toBe('low')
  })
})

describe('sortSuggestions', () => {
  it('orders by confidence desc, then amount diff, then date diff, then id', () => {
    const out = sortSuggestions([
      sug({ transaction_id: 'd', confidence: 60, amount_diff: 0, date_diff_days: 2 }),
      sug({ transaction_id: 'b', confidence: 90, amount_diff: 500, date_diff_days: 0 }),
      sug({ transaction_id: 'a', confidence: 90, amount_diff: -100, date_diff_days: 1 }),
      sug({ transaction_id: 'c', confidence: 60, amount_diff: 0, date_diff_days: 1 }),
      sug({ transaction_id: 'e', confidence: 60, amount_diff: 0, date_diff_days: 1 }),
    ])
    expect(out.map((s) => s.transaction_id)).toEqual(['a', 'b', 'c', 'e', 'd'])
  })
  it('does not mutate the input', () => {
    const input = [sug({ transaction_id: 'x', confidence: 1 }), sug({ transaction_id: 'y', confidence: 2 })]
    sortSuggestions(input)
    expect(input[0]!.transaction_id).toBe('x')
  })
})

describe('sides', () => {
  it('derives the bank side from debit/credit', () => {
    expect(bankSide({ debit: 500, credit: 0 })).toEqual({ amount: 500, isDebit: true })
    expect(bankSide({ debit: 0, credit: 700 })).toEqual({ amount: 700, isDebit: false })
  })
  it('mirrors ManualSide for every type', () => {
    expect(manualSide(tx({ id: '1', type: 'expense' }), 'acc')).toEqual({ amount: 100, isDebit: true })
    expect(manualSide(tx({ id: '1', type: 'income' }), 'acc')).toEqual({ amount: 100, isDebit: false })
    expect(manualSide(tx({ id: '1', type: 'refund' }), 'acc')).toEqual({ amount: 100, isDebit: false })
    expect(manualSide(tx({ id: '1', type: 'expense', account_id: 'other' }), 'acc')).toBeNull()
    expect(manualSide(tx({ id: '1', type: 'transfer', transfer_account_id: 'b' }), 'acc')).toEqual({
      amount: 100,
      isDebit: true,
    })
    expect(
      manualSide(tx({ id: '1', type: 'transfer', account_id: 'b', transfer_account_id: 'acc' }), 'acc'),
    ).toEqual({ amount: 100, isDebit: false })
    expect(manualSide(tx({ id: '1', type: 'adjustment', amount: -40 }), 'acc')).toEqual({
      amount: 40,
      isDebit: true,
    })
  })
  it('computes date distance in whole days', () => {
    expect(dateDiffDays('2026-11-04', '2026-11-01')).toBe(3)
    expect(dateDiffDays('2026-11-01', '2026-11-04')).toBe(3)
    expect(dateDiffDays('bad', '2026-11-04')).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('rankManualCandidates', () => {
  const bank = { debit: 8540, credit: 0, transaction_date: '2026-11-10', account_id: 'acc' }
  it('puts same-amount first (closest date), then nearest amount, wrong direction last', () => {
    const out = rankManualCandidates(bank, [
      tx({ id: 'near-amount', amount: 8600, transaction_date: '2026-11-10' }),
      tx({ id: 'same-far', amount: 8540, transaction_date: '2026-11-01' }),
      tx({ id: 'income-same', type: 'income', amount: 8540, transaction_date: '2026-11-10' }),
      tx({ id: 'same-close', amount: 8540, transaction_date: '2026-11-11' }),
      tx({ id: 'far-amount', amount: 20000, transaction_date: '2026-11-10' }),
      tx({ id: 'other-account', amount: 8540, account_id: 'zzz' }),
    ])
    expect(out.map((r) => r.tx.id)).toEqual(['same-close', 'same-far', 'near-amount', 'far-amount', 'income-same'])
    expect(out[0]).toMatchObject({ sameAmount: true, sameDirection: true, amountDiff: 0, dateDiff: 1 })
    expect(out[2]).toMatchObject({ sameAmount: false, amountDiff: -60 })
    expect(out[4]!.sameDirection).toBe(false)
  })
  it('breaks exact ties by id for determinism', () => {
    const out = rankManualCandidates(bank, [tx({ id: 'b', amount: 8540 }), tx({ id: 'a', amount: 8540 })])
    expect(out.map((r) => r.tx.id)).toEqual(['a', 'b'])
  })
})

describe('misc', () => {
  it('labels rules', () => {
    expect(ruleLabel('exact_date')).toBe('Same amount & date')
    expect(ruleLabel('amount_mismatch')).toBe('Near amount')
    expect(ruleLabel('something_new')).toBe('something new')
  })
  it('builds reject keys and searches case-insensitively', () => {
    expect(rejectKey('b1', 't1')).toBe('b1:t1')
    expect(matchesSearch(['POS Ambient Cafe', null], 'ambient')).toBe(true)
    expect(matchesSearch(['POS Ambient Cafe'], 'zzz')).toBe(false)
    expect(matchesSearch([], '   ')).toBe(true)
  })
})

describe('cleanDescription', () => {
  it('drops bank noise tokens and title-cases the rest', async () => {
    const { cleanDescription } = await import('./reconciliation')
    expect(cleanDescription('POS 123456 AMBIENT CAFE THIMPHU')).toBe('Ambient Cafe Thimphu')
    expect(cleanDescription('UPI/TRF/TO/druk air ref 99')).toBe('Druk Air')
    expect(cleanDescription('12345')).toBe('12345')
  })
})
