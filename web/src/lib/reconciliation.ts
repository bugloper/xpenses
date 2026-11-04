// Pure helpers for the reconciliation workspace: suggestion ranking, confidence
// colouring and the manual-match picker ordering.
import type { BankTransaction, Suggestion, SuggestionRule, Transaction } from '@/types/api'

export type ConfidenceTone = 'high' | 'medium' | 'low'

/** >= 85 high (green), >= 60 medium (amber), else low (grey). */
export function confidenceTone(confidence: number): ConfidenceTone {
  if (confidence >= 85) return 'high'
  if (confidence >= 60) return 'medium'
  return 'low'
}

export const RULE_LABELS: Record<SuggestionRule | 'manual' | 'transfer' | 'created' | 'adjustment' | 'ignored', string> = {
  exact_date: 'Same amount & date',
  date_tolerance: 'Same amount, nearby date',
  merchant_similarity: 'Similar merchant',
  description_similarity: 'Similar description',
  amount_mismatch: 'Near amount',
  manual: 'Matched manually',
  transfer: 'Transfer',
  created: 'Created from bank line',
  adjustment: 'Matched with adjustment',
  ignored: 'Ignored',
}

export function ruleLabel(rule: string): string {
  return (RULE_LABELS as Record<string, string>)[rule] ?? rule.replace(/_/g, ' ')
}

/** Confidence desc, then smaller amount diff, then smaller date diff, then id for determinism. */
export function sortSuggestions(list: ReadonlyArray<Suggestion>): Suggestion[] {
  return [...list].sort((a, b) => {
    if (a.confidence !== b.confidence) return b.confidence - a.confidence
    const ad = Math.abs(a.amount_diff)
    const bd = Math.abs(b.amount_diff)
    if (ad !== bd) return ad - bd
    if (a.date_diff_days !== b.date_diff_days) return a.date_diff_days - b.date_diff_days
    return a.transaction_id.localeCompare(b.transaction_id)
  })
}

export type Side = { amount: number; isDebit: boolean }

export function bankSide(b: Pick<BankTransaction, 'debit' | 'credit'>): Side {
  if (b.debit > 0) return { amount: b.debit, isDebit: true }
  return { amount: b.credit, isDebit: false }
}

/** Mirrors reconciliation.ManualSide: how a manual transaction looks from the statement account. */
export function manualSide(
  t: Pick<Transaction, 'type' | 'amount' | 'account_id' | 'transfer_account_id'>,
  accountId: string,
): Side | null {
  const onAccount = t.account_id === accountId
  switch (t.type) {
    case 'expense':
      return onAccount ? { amount: t.amount, isDebit: true } : null
    case 'income':
    case 'refund':
      return onAccount ? { amount: t.amount, isDebit: false } : null
    case 'transfer':
      if (onAccount) return { amount: t.amount, isDebit: true }
      if (t.transfer_account_id === accountId) return { amount: t.amount, isDebit: false }
      return null
    case 'adjustment':
      if (!onAccount) return null
      return t.amount < 0 ? { amount: -t.amount, isDebit: true } : { amount: t.amount, isDebit: false }
    default:
      return null
  }
}

/** |a - b| in whole days for two YYYY-MM-DD strings; NaN-safe (returns a large number). */
export function dateDiffDays(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`)
  const tb = Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.MAX_SAFE_INTEGER
  return Math.round(Math.abs(ta - tb) / 86_400_000)
}

export type RankedCandidate<T> = {
  tx: T
  amountDiff: number // bank − manual, signed
  dateDiff: number
  sameAmount: boolean
  sameDirection: boolean
}

/**
 * Orders manual candidates for the "match manually" picker: same amount first
 * (closest date first within), then by amount distance, then date distance.
 * Candidates on the wrong side (debit vs credit) sink to the bottom because the
 * server rejects them; they are kept so the user can see why nothing fits.
 */
export function rankManualCandidates<T extends Pick<Transaction, 'id' | 'type' | 'amount' | 'account_id' | 'transfer_account_id' | 'transaction_date'>>(
  bank: Pick<BankTransaction, 'debit' | 'credit' | 'transaction_date' | 'account_id'>,
  candidates: ReadonlyArray<T>,
): RankedCandidate<T>[] {
  const bs = bankSide(bank)
  const ranked = candidates.flatMap((tx) => {
    const ms = manualSide(tx, bank.account_id)
    if (!ms) return []
    return [
      {
        tx,
        amountDiff: bs.amount - ms.amount,
        dateDiff: dateDiffDays(bank.transaction_date, tx.transaction_date),
        sameAmount: ms.amount === bs.amount,
        sameDirection: ms.isDebit === bs.isDebit,
      },
    ]
  })
  return ranked.sort((a, b) => {
    if (a.sameDirection !== b.sameDirection) return a.sameDirection ? -1 : 1
    if (a.sameAmount !== b.sameAmount) return a.sameAmount ? -1 : 1
    if (a.sameAmount) {
      if (a.dateDiff !== b.dateDiff) return a.dateDiff - b.dateDiff
    } else {
      const ad = Math.abs(a.amountDiff)
      const bd = Math.abs(b.amountDiff)
      if (ad !== bd) return ad - bd
      if (a.dateDiff !== b.dateDiff) return a.dateDiff - b.dateDiff
    }
    return a.tx.id.localeCompare(b.tx.id)
  })
}

/** Session-scoped memory of dismissed suggestions (never sent to the server). */
const REJECT_PREFIX = 'xpensiv:rejected-suggestions:'

export function loadRejected(statementId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(REJECT_PREFIX + statementId)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function saveRejected(statementId: string, set: Set<string>) {
  try {
    sessionStorage.setItem(REJECT_PREFIX + statementId, JSON.stringify(Array.from(set)))
  } catch {
    // storage unavailable (private mode): dismissals simply do not persist
  }
}

export function rejectKey(bankId: string, transactionId: string): string {
  return `${bankId}:${transactionId}`
}

export type BankStatusFilter = 'all' | 'unrecorded' | 'matched' | 'ignored' | 'transfer' | 'suggested'
export type ManualStatusFilter = 'all' | 'unmatched' | 'matched' | 'possible_duplicate' | 'ignored' | 'transfer'

export function matchesSearch(haystack: ReadonlyArray<string | null | undefined>, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return haystack.some((h) => (h ?? '').toLowerCase().includes(needle))
}

// Port of reconciliation.CleanDescription: lowercase, keep letters, drop
// noise/short tokens, Title Case. Used to prefill the payee when creating a
// transaction from a bank line (the server applies the same rule if left blank).
const NOISE = new Set([
  'pos', 'upi', 'imps', 'neft', 'rtgs', 'txn', 'ref', 'mbob', 'trf', 'to', 'from', 'the', 'of', 'and',
  'at', 'by', 'for', 'a', 'an',
])

export function cleanDescription(desc: string): string {
  const letters = desc
    .toLowerCase()
    .split('')
    .map((ch) => (/\p{L}/u.test(ch) || /\s/.test(ch) ? ch : ' '))
    .join('')
  const tokens = letters
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !NOISE.has(t))
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
  return tokens.length ? tokens.join(' ') : desc.trim()
}
