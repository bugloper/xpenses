// Small presentational helpers shared by the report tabs.
import { format } from 'date-fns'
import { formatMonthLabel, parseISODate } from '@/lib/dates'

/** A cash-flow bucket written out in full: "Tue 4 Nov", "Week 45, 2026", "Nov 2026". */
export function periodLong(period: string): string {
  if (/^\d{4}-\d{2}$/.test(period)) return formatMonthLabel(period)
  const w = /^(\d{4})-W(\d{2})$/.exec(period)
  if (w) return `Week ${Number(w[2])}, ${w[1]}`
  const d = parseISODate(period)
  return d ? format(d, 'EEE d MMM') : period
}

/** "1 Sep" — a date without its year, for sentences. */
export function shortDate(iso: string): string {
  const d = parseISODate(iso)
  return d ? format(d, 'd MMM') : iso
}
