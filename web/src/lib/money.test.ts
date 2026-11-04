import { describe, expect, it } from 'vitest'
import { formatMoney, formatPct, minorToDecimalString, parseAmount, signedAmount, splitMinor } from './money'

describe('formatMoney', () => {
  it('formats BTN with Nu. symbol and thousands separators', () => {
    expect(formatMoney(123456, 'BTN')).toBe('Nu. 1,234.56')
    expect(formatMoney(100000000)).toBe('Nu. 1,000,000')
  })
  it('formats zero', () => {
    expect(formatMoney(0)).toBe('Nu. 0')
    expect(formatMoney(0, 'BTN', { sign: 'always' })).toBe('Nu. 0')
  })
  it('formats negative values with a leading minus', () => {
    expect(formatMoney(-8540)).toBe('-Nu. 85.40')
    expect(formatMoney(-5)).toBe('-Nu. 0.05')
  })
  it('adds + when sign is always', () => {
    expect(formatMoney(250000, 'BTN', { sign: 'always' })).toBe('+Nu. 2,500')
    expect(formatMoney(-8540, 'BTN', { sign: 'always' })).toBe('-Nu. 85.40')
  })
  it('hides sign when never', () => {
    expect(formatMoney(-8540, 'BTN', { sign: 'never' })).toBe('Nu. 85.40')
  })
  it('falls back to the currency code for unknown currencies', () => {
    expect(formatMoney(1050, 'XYZ')).toBe('XYZ 10.50')
    expect(formatMoney(1050, 'USD')).toBe('$ 10.50')
  })
  it('never rounds through floats (large values stay exact)', () => {
    expect(formatMoney(999999999999)).toBe('Nu. 9,999,999,999.99')
    expect(formatMoney(1)).toBe('Nu. 0.01')
    expect(formatMoney(10)).toBe('Nu. 0.10')
  })
  it('supports bare numbers', () => {
    expect(formatMoney(8540, 'BTN', { bare: true })).toBe('85.40')
  })
})

describe('splitMinor', () => {
  it('pads fraction', () => {
    expect(splitMinor(7)).toEqual({ negative: false, whole: '0', fraction: '07' })
    expect(splitMinor(-1234)).toEqual({ negative: true, whole: '12', fraction: '34' })
  })
})

describe('parseAmount', () => {
  it('parses common decimal inputs exactly', () => {
    expect(parseAmount('85.40')).toBe(8540)
    expect(parseAmount('85.4')).toBe(8540)
    expect(parseAmount('85')).toBe(8500)
    expect(parseAmount('85.')).toBe(8500)
    expect(parseAmount('.5')).toBe(50)
    expect(parseAmount('0.07')).toBe(7)
    expect(parseAmount('1,234.56')).toBe(123456)
    expect(parseAmount(' 12.30 ')).toBe(1230)
  })
  it('handles the classic float traps', () => {
    expect(parseAmount('0.1')).toBe(10)
    expect(parseAmount('0.2')).toBe(20)
    expect(parseAmount('1.15')).toBe(115)
    expect(parseAmount('4.35')).toBe(435)
  })
  it('supports negative input for adjustments', () => {
    expect(parseAmount('-12.50')).toBe(-1250)
  })
  it('rejects invalid input', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('1.234')).toBeNull()
    expect(parseAmount('1..2')).toBeNull()
    expect(parseAmount('.')).toBeNull()
  })
})

describe('minorToDecimalString', () => {
  it('round-trips with parseAmount', () => {
    for (const v of [0, 1, 99, 100, 8540, 123456, -1250]) {
      expect(parseAmount(minorToDecimalString(v))).toBe(v)
    }
  })
})

describe('signedAmount', () => {
  it('signs by type', () => {
    expect(signedAmount('expense', 100)).toBe(-100)
    expect(signedAmount('income', 100)).toBe(100)
    expect(signedAmount('refund', 100)).toBe(100)
    expect(signedAmount('adjustment', -30)).toBe(-30)
    expect(signedAmount('transfer', 30)).toBe(30)
  })
})

describe('formatPct', () => {
  it('formats with sign', () => {
    expect(formatPct(12.345)).toBe('+12.3%')
    expect(formatPct(-3)).toBe('-3.0%')
    expect(formatPct(0)).toBe('0.0%')
    expect(formatPct(null)).toBe('—')
  })
})
