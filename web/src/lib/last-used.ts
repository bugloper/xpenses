// Remembers the last account/category per transaction type (localStorage),
// mirrored to /settings ui.last_account_id + ui.last_category_id by the form.
import type { TransactionType } from '@/types/api'

const KEY = 'xpensiv-last-used'
type Store = Partial<
  Record<TransactionType, { account_id?: string; category_id?: string; transfer_account_id?: string }>
>

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Store) : {}
  } catch {
    return {}
  }
}

export function getLastUsed(type: TransactionType) {
  return read()[type] ?? {}
}

export function setLastUsed(
  type: TransactionType,
  values: { account_id?: string; category_id?: string; transfer_account_id?: string },
) {
  try {
    const s = read()
    s[type] = { ...s[type], ...values }
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage unavailable (private mode) - ignore
  }
}
