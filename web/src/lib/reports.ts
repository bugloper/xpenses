// Period presets, URL params and export URLs for the Reports screen.
import { addMonths, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns'
import { toQuery } from '@/lib/api'
import { isISODate, toISODate, type DateRange } from '@/lib/dates'
import type { CashFlowGranularity, ExportFormat, ExportReport, FlowType } from '@/types/api'

export type ReportPeriodPreset = 'month' | 'prev_month' | 'week' | 'last3' | 'custom'
export const REPORT_PRESETS: { value: ReportPeriodPreset; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'prev_month', label: 'Previous month' },
  { value: 'week', label: 'This week' },
  { value: 'last3', label: 'Last 3 months' },
]

export function reportPresetRange(preset: ReportPeriodPreset, now = new Date()): DateRange {
  switch (preset) {
    case 'week':
      return {
        from: toISODate(startOfWeek(now, { weekStartsOn: 1 })),
        to: toISODate(endOfWeek(now, { weekStartsOn: 1 })),
      }
    case 'prev_month': {
      const prev = addMonths(now, -1)
      return { from: toISODate(startOfMonth(prev)), to: toISODate(endOfMonth(prev)) }
    }
    case 'last3':
      return { from: toISODate(startOfMonth(addMonths(now, -2))), to: toISODate(endOfMonth(now)) }
    case 'month':
    case 'custom':
    default:
      return { from: toISODate(startOfMonth(now)), to: toISODate(endOfMonth(now)) }
  }
}

export type ReportsSearch = {
  period?: ReportPeriodPreset
  from?: string
  to?: string
}

/** Resolves URL search params into a concrete range, falling back to this month. */
export function resolveReportRange(search: ReportsSearch, now = new Date()): { preset: ReportPeriodPreset; range: DateRange } {
  const preset = search.period ?? 'month'
  if (preset === 'custom') {
    if (search.from && search.to && isISODate(search.from) && isISODate(search.to) && search.from <= search.to)
      return { preset, range: { from: search.from, to: search.to } }
    return { preset: 'month', range: reportPresetRange('month', now) }
  }
  return { preset, range: reportPresetRange(preset, now) }
}

/** Search params to write for a preset change (month is the default so it clears). */
export function periodSearch(preset: ReportPeriodPreset, range: DateRange): ReportsSearch {
  if (preset === 'custom') return { period: 'custom', from: range.from, to: range.to }
  if (preset === 'month') return { period: undefined, from: undefined, to: undefined }
  return { period: preset, from: undefined, to: undefined }
}

export type ExportParams = {
  from?: string
  to?: string
  granularity?: CashFlowGranularity
  type?: FlowType
  month?: string
  statement_id?: string
}

/** Path (relative to the API base) for GET /reports/export with only the params that report uses. */
export function exportPath(report: ExportReport, format: ExportFormat, params: ExportParams): string {
  const q: Record<string, string | undefined> = { report, format }
  switch (report) {
    case 'summary':
    case 'accounts':
      q.from = params.from
      q.to = params.to
      break
    case 'categories':
    case 'merchants':
      q.from = params.from
      q.to = params.to
      q.type = params.type
      break
    case 'cash-flow':
      q.from = params.from
      q.to = params.to
      q.granularity = params.granularity
      break
    case 'budgets':
      q.month = params.month
      break
    case 'reconciliation':
      q.statement_id = params.statement_id
      break
  }
  return `/reports/export${toQuery(q)}`
}

export function exportFileName(report: ExportReport, format: ExportFormat, params: ExportParams): string {
  const stamp =
    report === 'budgets' ? params.month : report === 'reconciliation' ? params.statement_id : `${params.from}_${params.to}`
  return `${report}-${stamp ?? 'export'}.${format}`
}

/** "2026-11" ± n months. */
export function stepMonth(yyyymm: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyymm)
  if (!m) return yyyymm
  const year = Number(m[1])
  const month = Number(m[2]) - 1 + delta
  const d = new Date(Date.UTC(year, month, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function isMonth(s: string | undefined): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
}

/** Default cash-flow granularity for a range (day ≤ 31 days, else week ≤ 180, else month). */
export function defaultGranularity(range: DateRange): CashFlowGranularity {
  const from = Date.parse(`${range.from}T00:00:00Z`)
  const to = Date.parse(`${range.to}T00:00:00Z`)
  const days = Number.isNaN(from) || Number.isNaN(to) ? 1 : Math.round((to - from) / 86_400_000) + 1
  if (days <= 31) return 'day'
  if (days <= 180) return 'week'
  return 'month'
}

/** Integer percentage share (0–100) with no float accumulation. */
export function pctOf(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part * 100) / total)
}

/** One-decimal percentage as a string ("12.3") using integer math. */
export function pct1(part: number, total: number): string {
  if (total <= 0) return '0.0'
  const tenths = Math.round((part * 1000) / total)
  return `${Math.trunc(tenths / 10)}.${tenths % 10}`
}
