// Date helpers. Financial dates are plain `YYYY-MM-DD` strings in local time.
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from 'date-fns'

export const ISO_DATE = 'yyyy-MM-dd'

export function toISODate(d: Date): string {
  return format(d, ISO_DATE)
}

export function today(): string {
  return toISODate(new Date())
}

export function yesterday(): string {
  return toISODate(subDays(new Date(), 1))
}

export function parseISODate(s: string | undefined | null): Date | null {
  if (!s) return null
  const d = parseISO(s)
  return isValid(d) ? d : null
}

export function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && parseISODate(s) !== null
}

/** "Tue, 4 Nov" style; today/yesterday get friendly labels. */
export function formatDayHeading(iso: string): string {
  if (iso === today()) return 'Today'
  if (iso === yesterday()) return 'Yesterday'
  const d = parseISODate(iso)
  if (!d) return iso
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return format(d, sameYear ? 'EEE, d MMM' : 'EEE, d MMM yyyy')
}

export function formatShortDate(iso: string): string {
  const d = parseISODate(iso)
  return d ? format(d, 'd MMM yyyy') : iso
}

export function formatMonthLabel(yyyymm: string): string {
  const d = parseISODate(`${yyyymm}-01`)
  return d ? format(d, 'MMM yyyy') : yyyymm
}

export function currentMonth(): string {
  return format(new Date(), 'yyyy-MM')
}

export type PeriodPreset = 'today' | 'week' | 'month' | 'prev_month' | 'year' | 'custom'

/** The periods every screen offers, in order (custom comes last, as a picker). */
export const PERIOD_PRESETS: { value: Exclude<PeriodPreset, 'custom'>; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'prev_month', label: 'Previous month' },
  { value: 'year', label: 'This year' },
]
export type DateRange = { from: string; to: string }

export function presetRange(preset: PeriodPreset, now = new Date()): DateRange {
  switch (preset) {
    case 'today':
      return { from: toISODate(now), to: toISODate(now) }
    case 'week':
      return {
        from: toISODate(startOfWeek(now, { weekStartsOn: 1 })),
        to: toISODate(endOfWeek(now, { weekStartsOn: 1 })),
      }
    case 'prev_month': {
      const prev = addMonths(now, -1)
      return { from: toISODate(startOfMonth(prev)), to: toISODate(endOfMonth(prev)) }
    }
    case 'year':
      return { from: toISODate(startOfYear(now)), to: toISODate(endOfYear(now)) }
    case 'month':
    case 'custom':
    default:
      return { from: toISODate(startOfMonth(now)), to: toISODate(endOfMonth(now)) }
  }
}

export function rangeLabel(range: DateRange): string {
  const f = parseISODate(range.from)
  const t = parseISODate(range.to)
  if (!f || !t) return `${range.from} – ${range.to}`
  if (range.from === range.to) return format(f, 'd MMM yyyy')
  if (f.getFullYear() === t.getFullYear()) return `${format(f, 'd MMM')} – ${format(t, 'd MMM yyyy')}`
  return `${format(f, 'd MMM yyyy')} – ${format(t, 'd MMM yyyy')}`
}

/** Number of days in an inclusive range. */
export function rangeDays(range: DateRange): number {
  const f = parseISODate(range.from)
  const t = parseISODate(range.to)
  if (!f || !t) return 1
  return Math.max(1, Math.round((t.getTime() - f.getTime()) / 86_400_000) + 1)
}

/** Month (YYYY-MM) containing the end of the range - used for the budget widget. */
export function rangeMonth(range: DateRange): string {
  return range.to.slice(0, 7)
}

/** Cash-flow granularity that gives a readable number of bars. */
export function granularityFor(range: DateRange): 'day' | 'week' | 'month' {
  const days = rangeDays(range)
  if (days <= 31) return 'day'
  if (days <= 180) return 'week'
  return 'month'
}

/** "Last 6 months" window ending at the end of the range's month, for the trend chart. */
export function trendRange(range: DateRange): DateRange {
  const t = parseISODate(range.to) ?? new Date()
  const start = startOfMonth(addMonths(t, -5))
  return { from: toISODate(start), to: toISODate(endOfMonth(t)) }
}

/** The twelve months to the end of the range's month, for year-long trends. */
export function twelveMonthsTo(range: DateRange): DateRange {
  const t = parseISODate(range.to) ?? new Date()
  return { from: toISODate(startOfMonth(addMonths(t, -11))), to: toISODate(endOfMonth(t)) }
}

export function formatPeriodTick(period: string): string {
  if (/^\d{4}-\d{2}$/.test(period)) return formatMonthLabel(period).slice(0, 3)
  if (/^\d{4}-W\d{2}$/.test(period)) return `W${period.slice(6)}`
  const d = parseISODate(period)
  return d ? format(d, 'd') : period
}

export function relativeTime(iso: string): string {
  const d = new Date(iso)
  if (!isValid(d)) return ''
  const diff = Date.now() - d.getTime()
  const future = diff < 0
  const m = Math.round(Math.abs(diff) / 60_000)
  if (m < 1) return future ? 'in a moment' : 'just now'
  if (m < 60) return future ? `in ${m}m` : `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return future ? `in ${h}h` : `${h}h ago`
  return format(d, 'd MMM, HH:mm')
}

export { addDays }

/** "4 Nov 2026, 19:13" from an RFC3339 timestamp, in the viewer's local time. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
