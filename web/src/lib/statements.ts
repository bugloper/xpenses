// Pure helpers for the statement import wizard. Integer math only: every
// amount is minor units and nothing here touches floats.
import type { ImportValidation, PreviewStatement, PreviewTransaction } from '@/types/api'

/** Server default (XPENSIV_MAX_UPLOAD_BYTES): 10 MiB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export type UploadErrorField = 'password' | 'file' | 'account' | 'form'
export type UploadErrorInfo = { field: UploadErrorField; title: string; description: string }

/**
 * Maps the parse endpoint's error codes to where the message belongs and what
 * to say. Unknown codes fall back to a form-level message with the server text.
 */
export function uploadErrorInfo(code: string, serverMessage?: string): UploadErrorInfo {
  switch (code) {
    case 'pdf_password_required':
      return {
        field: 'password',
        title: 'This statement is password-protected',
        description: 'Enter the PDF password: the day and month of your date of birth (DDMM).',
      }
    case 'pdf_password_incorrect':
      return {
        field: 'password',
        title: 'The password did not open this statement',
        description: 'Check the DDMM of your date of birth and try again.',
      }
    case 'pdf_no_text':
      return {
        field: 'file',
        title: 'This looks like a scanned PDF',
        description:
          'No text could be extracted, so the statement cannot be read. Scanned statements need OCR, which is not supported yet. Nothing was imported.',
      }
    case 'pdf_unrecognised':
      return {
        field: 'file',
        title: 'Statement layout not recognised',
        description:
          'The PDF opened but no statement table was found in it. Make sure this is a BOB account statement export. Nothing was imported.',
      }
    case 'payload_too_large':
      return {
        field: 'file',
        title: 'The PDF is too large',
        description: `Statements must be ${formatBytes(MAX_UPLOAD_BYTES)} or smaller.`,
      }
    case 'invalid_file':
      return {
        field: 'file',
        title: 'Not a readable PDF',
        description: serverMessage || 'Choose the PDF statement exported from BOB mBOB/internet banking.',
      }
    case 'validation_error':
      return {
        field: 'account',
        title: 'Check the form',
        description: serverMessage || 'Select the account this statement belongs to.',
      }
    case 'network_error':
      return {
        field: 'form',
        title: 'Could not reach the server',
        description: 'Statement parsing needs a connection. Try again when you are back online.',
      }
    default:
      return {
        field: 'form',
        title: 'Could not parse the statement',
        description: serverMessage || 'Something went wrong. Try again.',
      }
  }
}

/** Client-side file check before upload: PDF extension and size cap. */
export function validateStatementFile(file: File, max = MAX_UPLOAD_BYTES): string | null {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return 'Choose a PDF file.'
  if (file.size === 0) return 'The file is empty.'
  if (file.size > max) return `The PDF is ${formatBytes(file.size)}; the limit is ${formatBytes(max)}.`
  return null
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round((n * 10) / 1024) / 10} KB`
  return `${Math.round((n * 10) / (1024 * 1024)) / 10} MB`
}

/** "1234567890" -> "•••• 7890". Short numbers are shown as-is. */
export function maskAccountNumber(n: string): string {
  const s = (n ?? '').replace(/\s+/g, '')
  if (s.length <= 4) return s
  return `•••• ${s.slice(-4)}`
}

export type EditableRow = PreviewTransaction & { _key: string }

/** Keys rows so edits/deletes stay stable while line numbers are renumbered. */
export function toEditableRows(rows: PreviewTransaction[]): EditableRow[] {
  return rows.map((r, i) => ({ ...r, _key: `${r.line_no}-${i}-${r.fingerprint}` }))
}

/** Strips the local key and renumbers line_no so the server sees a contiguous list. */
export function toImportRows(rows: EditableRow[]): PreviewTransaction[] {
  return rows.map(({ _key: _k, ...r }, i) => ({ ...r, line_no: i + 1 }))
}

/**
 * Re-implements internal/pdf.Validate for the preview screen so edits to rows
 * or balances refresh the banner without a round-trip. Mirrors the server
 * message wording so what the user sees before and after import agrees.
 */
export function recomputeValidation(
  statement: Pick<PreviewStatement, 'opening_balance' | 'closing_balance'>,
  rows: ReadonlyArray<Pick<PreviewTransaction, 'debit' | 'credit' | 'balance'>>,
): ImportValidation {
  const v: ImportValidation = {
    balance_check: 'unavailable',
    computed_closing: null,
    difference: 0,
    messages: [],
  }
  let debits = 0
  let credits = 0
  let lastBalance: number | null = null
  let prev: number | null = null
  let continuityBreaks = 0
  for (const t of rows) {
    debits += t.debit
    credits += t.credit
    if (t.balance !== null) {
      if (prev !== null && prev + t.credit - t.debit !== t.balance) continuityBreaks++
      prev = t.balance
      lastBalance = t.balance
    }
  }
  if (continuityBreaks > 0) {
    v.messages.push(
      continuityBreaks === 1
        ? '1 row where the running balance does not follow from the previous row'
        : `${continuityBreaks} rows where the running balance does not follow from the previous row`,
    )
  }
  if (statement.opening_balance === null) {
    v.messages.push('opening balance not found; cannot verify the closing balance')
    return v
  }
  const computed = statement.opening_balance + credits - debits
  v.computed_closing = computed
  let stated = statement.closing_balance
  if (stated === null && lastBalance !== null) {
    stated = lastBalance
    v.messages.push('closing balance taken from the last row of the balance column')
  }
  if (stated === null) {
    v.messages.push('closing balance not found; cannot verify the computed closing balance')
    return v
  }
  v.difference = stated - computed
  if (v.difference === 0) {
    v.balance_check = 'ok'
  } else {
    v.balance_check = 'mismatch'
    v.messages.push('stated closing balance differs from opening + credits - debits')
  }
  if (
    statement.closing_balance !== null &&
    lastBalance !== null &&
    statement.closing_balance !== lastBalance
  ) {
    v.messages.push('stated closing balance differs from the last running balance')
  }
  return v
}

/** Totals for the preview footer. */
export function previewTotals(rows: ReadonlyArray<Pick<PreviewTransaction, 'debit' | 'credit' | 'is_duplicate'>>) {
  let debits = 0
  let credits = 0
  let duplicates = 0
  for (const r of rows) {
    debits += r.debit
    credits += r.credit
    if (r.is_duplicate) duplicates++
  }
  return { debits, credits, duplicates, count: rows.length }
}

/** Per-row problems the server would reject at import time. */
export function rowProblems(r: Pick<PreviewTransaction, 'transaction_date' | 'debit' | 'credit'>): string[] {
  const out: string[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.transaction_date)) out.push('date must be YYYY-MM-DD')
  if (r.debit < 0 || r.credit < 0) out.push('amounts must not be negative')
  if (r.debit > 0 && r.credit > 0) out.push('a row cannot have both a debit and a credit')
  if (r.debit === 0 && r.credit === 0) out.push('a row needs a debit or a credit')
  return out
}

export function duplicateReasonText(reason: 'sha256' | 'period' | 'fingerprints'): string {
  switch (reason) {
    case 'sha256':
      return 'This exact file was already imported.'
    case 'period':
      return 'A statement for this account already covers an overlapping period.'
    case 'fingerprints':
      return 'Most of these rows already exist for this account.'
  }
}
