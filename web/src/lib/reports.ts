// Period presets, URL params and export URLs for the Reports screen.
import { toQuery } from '@/lib/api'
import { PERIOD_PRESETS, isISODate, presetRange, type DateRange, type PeriodPreset } from '@/lib/dates'
import type { CashFlowGranularity, ExportFormat, ExportReport, FlowType, ReportCategory } from '@/types/api'

// Reports offer the same periods as the dashboard.
export type ReportPeriodPreset = PeriodPreset
export const REPORT_PRESETS = PERIOD_PRESETS
export const reportPresetRange = presetRange

export type ReportsSearch = {
  period?: ReportPeriodPreset
  from?: string
  to?: string
}

/** Resolves URL search params into a concrete range, falling back to this month. */
export function resolveReportRange(
  search: ReportsSearch,
  now = new Date(),
): { preset: ReportPeriodPreset; range: DateRange } {
  const preset = search.period ?? 'month'
  if (preset === 'custom') {
    if (
      search.from &&
      search.to &&
      isISODate(search.from) &&
      isISODate(search.to) &&
      search.from <= search.to
    )
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
  }
  return `/reports/export${toQuery(q)}`
}

export function exportFileName(report: ExportReport, format: ExportFormat, params: ExportParams): string {
  const stamp = report === 'budgets' ? params.month : `${params.from}_${params.to}`
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

export type CategoryRollup = {
  /** The main category (or a stand-alone category / "Uncategorised"). */
  row: ReportCategory
  /** Sub-category rows folded into this one, largest first. */
  children: ReportCategory[]
  amount: number
  count: number
}

/**
 * Folds sub-category rows into their parent so charts show main categories.
 * A parent with no transactions of its own still appears when its
 * sub-categories do; its own spending is listed as a "General" child.
 */
export function rollupCategories(rows: ReportCategory[]): CategoryRollup[] {
  const groups = new Map<string, CategoryRollup>()
  const keyOf = (r: ReportCategory) => r.parent_id ?? r.category_id ?? 'none'
  for (const r of rows) {
    const key = keyOf(r)
    let g = groups.get(key)
    if (!g) {
      const row: ReportCategory = r.parent_id
        ? {
            category_id: r.parent_id,
            name: r.parent_name,
            icon: r.icon,
            color: r.color,
            parent_id: null,
            parent_name: '',
            amount: 0,
            count: 0,
            pct: 0,
          }
        : { ...r }
      g = { row, children: [], amount: 0, count: 0 }
      groups.set(key, g)
    } else if (!r.parent_id) {
      // The parent's own row arrived after a child: adopt its icon/colour.
      g.row = { ...r, amount: g.row.amount, count: g.row.count }
    }
    g.amount += r.amount
    g.count += r.count
    if (r.parent_id) g.children.push(r)
  }
  const total = [...groups.values()].filter((g) => g.amount > 0).reduce((n, g) => n + g.amount, 0)
  const out = [...groups.values()].map((g) => {
    const own = g.amount - g.children.reduce((n, c) => n + c.amount, 0)
    const children =
      g.children.length > 0 && own > 0
        ? [
            {
              ...g.row,
              name: 'General',
              amount: own,
              count: g.count - g.children.reduce((n, c) => n + c.count, 0),
            },
            ...g.children,
          ]
        : g.children
    return {
      ...g,
      children: [...children].sort((a, b) => b.amount - a.amount),
      row: {
        ...g.row,
        amount: g.amount,
        count: g.count,
        pct: total > 0 ? Math.round((g.amount * 1000) / total) / 10 : 0,
      },
    }
  })
  // A main category whose refunds outweigh its spending has nothing to rank.
  return out.filter((g) => g.amount > 0).sort((a, b) => b.amount - a.amount)
}

/**
 * Refunds in the period beyond what was spent in their main categories (a
 * negative amount, 0 when none): what the ranked categories leave out, so
 * that ranked + this = the period's total.
 */
export function refundsBeyondSpending(rows: ReportCategory[]): number {
  const net = new Map<string, number>()
  for (const r of rows) {
    const key = r.parent_id ?? r.category_id ?? 'none'
    net.set(key, (net.get(key) ?? 0) + r.amount)
  }
  return [...net.values()].filter((v) => v < 0).reduce((n, v) => n + v, 0)
}
