// Money helpers. Every amount is an integer number of minor units (e.g. chhertum).
// No floating point is used anywhere in here: formatting is pure integer math and
// string padding, parsing is digit-string manipulation.

const SYMBOLS: Record<string, string> = { BTN: 'Nu.', INR: '₹', USD: '$', EUR: '€', GBP: '£' }

export function currencySymbol(code: string | undefined | null): string {
  if (!code) return SYMBOLS.BTN!
  return SYMBOLS[code.toUpperCase()] ?? code.toUpperCase()
}

function groupThousands(intPart: string): string {
  let out = ''
  let count = 0
  for (let i = intPart.length - 1; i >= 0; i--) {
    out = intPart[i] + out
    count++
    if (count % 3 === 0 && i > 0) out = ',' + out
  }
  return out
}

/** Splits minor units into { negative, whole, fraction } using integer math only. */
export function splitMinor(minor: number): { negative: boolean; whole: string; fraction: string } {
  if (!Number.isFinite(minor)) return { negative: false, whole: '0', fraction: '00' }
  const n = Math.trunc(minor)
  const negative = n < 0
  const abs = negative ? -n : n
  const whole = Math.trunc(abs / 100)
  const frac = abs % 100
  return { negative, whole: String(whole), fraction: frac < 10 ? `0${frac}` : String(frac) }
}

export type FormatMoneyOptions = {
  /** 'auto' shows "-" for negatives only; 'always' adds "+" for positives; 'never' hides the sign. */
  sign?: 'auto' | 'always' | 'never'
  /** Omit the currency symbol. */
  bare?: boolean
}

/**
 * `formatMoney(123456, 'BTN') === 'Nu. 1,234.56'`, `formatMoney(-8540) === '-Nu. 85.40'`.
 * Whole amounts drop the decimals: `formatMoney(500000) === 'Nu. 5,000'`.
 */
export function formatMoney(minor: number, currency: string = 'BTN', opts: FormatMoneyOptions = {}): string {
  const { negative, whole, fraction } = splitMinor(minor)
  const number = fraction === '00' ? groupThousands(whole) : `${groupThousands(whole)}.${fraction}`
  const body = opts.bare ? number : `${currencySymbol(currency)} ${number}`
  const sign = opts.sign ?? 'auto'
  const isZero = Math.trunc(minor) === 0
  if (negative && sign !== 'never') return `-${body}`
  if (!negative && !isZero && sign === 'always') return `+${body}`
  return body
}

/** Signed display for a transaction amount: money out negative, money in positive. */
export function signedAmount(type: string, amount: number): number {
  switch (type) {
    case 'expense':
    case 'loan_given':
    case 'loan_repayment':
      return -Math.abs(amount)
    case 'income':
    case 'refund':
    case 'loan_received':
    case 'loan_repayment_received':
      return Math.abs(amount)
    default:
      return amount
  }
}

/**
 * Parses a user-typed decimal string into minor units without floats.
 * "85.40" -> 8540, "85.4" -> 8540, "85" -> 8500, ".5" -> 50, "1,234.56" -> 123456.
 * Returns null when the input is not a valid amount (more than 2 decimals, letters, empty).
 */
export function parseAmount(input: string): number | null {
  if (typeof input !== 'string') return null
  let s = input.trim().replace(/,/g, '').replace(/\s+/g, '')
  if (s === '') return null
  let negative = false
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(s)) return null
  const [wholeRaw = '', fracRaw = ''] = s.split('.')
  const whole = wholeRaw === '' ? '0' : wholeRaw
  const frac = (fracRaw + '00').slice(0, 2)
  if (whole.length > 13) return null // keep well inside Number.MAX_SAFE_INTEGER
  const minor = Number(whole) * 100 + Number(frac)
  return negative ? -minor : minor
}

/** Minor units -> plain decimal string for inputs ("8540" -> "85.40"). */
export function minorToDecimalString(minor: number): string {
  const { negative, whole, fraction } = splitMinor(minor)
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

/** Percentage change helper rendered as "+12.5%" / "-3.0%" using integer-safe rounding to 1dp. */
export function formatPct(pct: number | null | undefined, digits = 1): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—'
  const factor = 10 ** digits
  const rounded = Math.round(pct * factor) / factor
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toFixed(digits)}%`
}
