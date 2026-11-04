import { describe, expect, it } from 'vitest'
import {
  MAX_UPLOAD_BYTES,
  maskAccountNumber,
  previewTotals,
  recomputeValidation,
  rowProblems,
  toEditableRows,
  toImportRows,
  uploadErrorInfo,
  validateStatementFile,
} from './statements'

const row = (debit: number, credit: number, balance: number | null) => ({ debit, credit, balance })

describe('recomputeValidation', () => {
  it('reports ok when opening + credits − debits equals the stated closing', () => {
    const v = recomputeValidation({ opening_balance: 10_000, closing_balance: 12_500 }, [
      row(0, 5_000, 15_000),
      row(2_500, 0, 12_500),
    ])
    expect(v.balance_check).toBe('ok')
    expect(v.computed_closing).toBe(12_500)
    expect(v.difference).toBe(0)
    expect(v.messages).toEqual([])
  })

  it('reports a mismatch with the signed difference (stated − computed)', () => {
    const v = recomputeValidation({ opening_balance: 10_000, closing_balance: 12_000 }, [
      row(0, 5_000, 15_000),
      row(2_500, 0, 12_500),
    ])
    expect(v.balance_check).toBe('mismatch')
    expect(v.computed_closing).toBe(12_500)
    expect(v.difference).toBe(-500)
    expect(v.messages).toContain('stated closing balance differs from opening + credits - debits')
    expect(v.messages).toContain('stated closing balance differs from the last running balance')
  })

  it('recomputes after a row edit without floats', () => {
    // 0.1 + 0.2 style amounts in minor units stay exact.
    const rows = [row(0, 10, 10), row(0, 20, 30), row(15, 0, 15)]
    const before = recomputeValidation({ opening_balance: 0, closing_balance: 15 }, rows)
    expect(before.balance_check).toBe('ok')
    rows[2] = row(16, 0, 14)
    const after = recomputeValidation({ opening_balance: 0, closing_balance: 15 }, rows)
    expect(after.balance_check).toBe('mismatch')
    expect(after.computed_closing).toBe(14)
    expect(after.difference).toBe(1)
  })

  it('stays exact for large balances', () => {
    const v = recomputeValidation({ opening_balance: 9_999_999_999_99, closing_balance: 9_999_999_999_98 }, [
      row(1, 0, 9_999_999_999_98),
    ])
    expect(v.balance_check).toBe('ok')
  })

  it('is unavailable without an opening balance', () => {
    const v = recomputeValidation({ opening_balance: null, closing_balance: 100 }, [row(0, 100, 100)])
    expect(v.balance_check).toBe('unavailable')
    expect(v.computed_closing).toBeNull()
    expect(v.messages).toEqual(['opening balance not found; cannot verify the closing balance'])
  })

  it('falls back to the last running balance when no closing balance was parsed', () => {
    const v = recomputeValidation({ opening_balance: 100, closing_balance: null }, [
      row(0, 50, 150),
      row(20, 0, 130),
    ])
    expect(v.balance_check).toBe('ok')
    expect(v.messages).toEqual(['closing balance taken from the last row of the balance column'])
  })

  it('is unavailable when neither closing nor running balances exist', () => {
    const v = recomputeValidation({ opening_balance: 100, closing_balance: null }, [row(0, 50, null)])
    expect(v.balance_check).toBe('unavailable')
    expect(v.computed_closing).toBe(150)
  })

  it('counts running-balance continuity breaks', () => {
    const v = recomputeValidation({ opening_balance: 0, closing_balance: 30 }, [
      row(0, 10, 10),
      row(0, 10, 25), // should be 20
      row(0, 10, 30), // 25 + 10 = 35, not 30
    ])
    expect(v.messages[0]).toBe('2 rows where the running balance does not follow from the previous row')
    const one = recomputeValidation({ opening_balance: 0, closing_balance: 20 }, [
      row(0, 10, 10),
      row(0, 10, 25),
    ])
    expect(one.messages[0]).toBe('1 row where the running balance does not follow from the previous row')
  })

  it('carries the last known running balance across rows without one (as the server does)', () => {
    const v = recomputeValidation({ opening_balance: 0, closing_balance: 30 }, [
      row(0, 10, 10),
      row(0, 10, null),
      row(0, 10, 30),
    ])
    // Totals still verify; the skipped row makes the next running balance look like a jump.
    expect(v.balance_check).toBe('ok')
    expect(v.messages).toEqual(['1 row where the running balance does not follow from the previous row'])
  })
})

describe('uploadErrorInfo', () => {
  it('routes password errors to the password field', () => {
    expect(uploadErrorInfo('pdf_password_required').field).toBe('password')
    expect(uploadErrorInfo('pdf_password_incorrect').field).toBe('password')
    expect(uploadErrorInfo('pdf_password_incorrect').title).toMatch(/password/i)
  })
  it('explains scanned and unrecognised PDFs on the file field', () => {
    const scanned = uploadErrorInfo('pdf_no_text')
    expect(scanned.field).toBe('file')
    expect(scanned.description).toMatch(/OCR/)
    const unrec = uploadErrorInfo('pdf_unrecognised')
    expect(unrec.field).toBe('file')
    expect(unrec.description).toMatch(/nothing was imported/i)
  })
  it('maps size and invalid-file codes', () => {
    expect(uploadErrorInfo('payload_too_large').description).toContain('10 MB')
    expect(uploadErrorInfo('invalid_file', 'custom').description).toBe('custom')
  })
  it('falls back to the server message for unknown codes', () => {
    const e = uploadErrorInfo('internal_error', 'boom')
    expect(e.field).toBe('form')
    expect(e.description).toBe('boom')
  })
})

describe('validateStatementFile', () => {
  const mk = (name: string, size: number, type = 'application/pdf') =>
    ({ name, size, type }) as unknown as File
  it('accepts a small PDF', () => {
    expect(validateStatementFile(mk('stmt.pdf', 1024))).toBeNull()
    expect(validateStatementFile(mk('STMT.PDF', 1024, ''))).toBeNull()
  })
  it('rejects non-PDFs, empty and oversized files', () => {
    expect(validateStatementFile(mk('stmt.csv', 10, 'text/csv'))).toMatch(/PDF/)
    expect(validateStatementFile(mk('stmt.pdf', 0))).toMatch(/empty/)
    expect(validateStatementFile(mk('stmt.pdf', MAX_UPLOAD_BYTES + 1))).toMatch(/limit is 10 MB/)
    expect(validateStatementFile(mk('stmt.pdf', MAX_UPLOAD_BYTES))).toBeNull()
  })
})

describe('row helpers', () => {
  it('masks account numbers', () => {
    expect(maskAccountNumber('1234567890')).toBe('•••• 7890')
    expect(maskAccountNumber('1234')).toBe('1234')
    expect(maskAccountNumber('')).toBe('')
  })
  it('renumbers line numbers on export and keeps stable keys', () => {
    const base = {
      transaction_date: '2026-01-01',
      value_date: null,
      description: 'x',
      reference: '',
      debit: 1,
      credit: 0,
      balance: null,
      fingerprint: 'f',
      is_duplicate: false,
      warnings: [],
    }
    const rows = toEditableRows([
      { ...base, line_no: 3 },
      { ...base, line_no: 7 },
    ])
    expect(rows[0]!._key).not.toBe(rows[1]!._key)
    const out = toImportRows([rows[1]!])
    expect(out).toHaveLength(1)
    expect(out[0]!.line_no).toBe(1)
    expect('_key' in out[0]!).toBe(false)
  })
  it('totals and flags problems', () => {
    const t = previewTotals([
      { debit: 100, credit: 0, is_duplicate: true },
      { debit: 0, credit: 250, is_duplicate: false },
    ])
    expect(t).toEqual({ debits: 100, credits: 250, duplicates: 1, count: 2 })
    expect(rowProblems({ transaction_date: '2026-1-1', debit: 0, credit: 0 })).toEqual([
      'date must be YYYY-MM-DD',
      'a row needs a debit or a credit',
    ])
    expect(rowProblems({ transaction_date: '2026-01-01', debit: 5, credit: 5 })).toEqual([
      'a row cannot have both a debit and a credit',
    ])
  })
})
