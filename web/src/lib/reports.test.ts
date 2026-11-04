import { describe, expect, it } from 'vitest'
import {
  defaultGranularity,
  exportFileName,
  exportPath,
  isMonth,
  pct1,
  pctOf,
  periodSearch,
  reportPresetRange,
  resolveReportRange,
  stepMonth,
} from './reports'

const now = new Date(2026, 10, 4) // Wed 4 Nov 2026 local

describe('reportPresetRange', () => {
  it('computes each preset', () => {
    expect(reportPresetRange('month', now)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(reportPresetRange('prev_month', now)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(reportPresetRange('week', now)).toEqual({ from: '2026-11-02', to: '2026-11-08' })
    expect(reportPresetRange('last3', now)).toEqual({ from: '2026-09-01', to: '2026-11-30' })
  })
})

describe('resolveReportRange', () => {
  it('defaults to this month', () => {
    expect(resolveReportRange({}, now)).toEqual({ preset: 'month', range: { from: '2026-11-01', to: '2026-11-30' } })
  })
  it('honours a valid custom range and rejects an invalid one', () => {
    expect(resolveReportRange({ period: 'custom', from: '2026-01-05', to: '2026-02-01' }, now)).toEqual({
      preset: 'custom',
      range: { from: '2026-01-05', to: '2026-02-01' },
    })
    expect(resolveReportRange({ period: 'custom', from: '2026-02-01', to: '2026-01-05' }, now).preset).toBe('month')
    expect(resolveReportRange({ period: 'custom', from: 'nope' }, now).preset).toBe('month')
  })
  it('writes minimal search params', () => {
    expect(periodSearch('month', { from: 'x', to: 'y' })).toEqual({ period: undefined, from: undefined, to: undefined })
    expect(periodSearch('last3', { from: 'x', to: 'y' })).toEqual({ period: 'last3', from: undefined, to: undefined })
    expect(periodSearch('custom', { from: '2026-01-01', to: '2026-01-31' })).toEqual({
      period: 'custom',
      from: '2026-01-01',
      to: '2026-01-31',
    })
  })
})

describe('exportPath', () => {
  const p = { from: '2026-11-01', to: '2026-11-30', granularity: 'week' as const, type: 'income' as const, month: '2026-11', statement_id: 'st1' }
  it('only sends the params each report understands', () => {
    expect(exportPath('summary', 'csv', p)).toBe('/reports/export?report=summary&format=csv&from=2026-11-01&to=2026-11-30')
    expect(exportPath('categories', 'pdf', p)).toBe(
      '/reports/export?report=categories&format=pdf&from=2026-11-01&to=2026-11-30&type=income',
    )
    expect(exportPath('cash-flow', 'csv', p)).toBe(
      '/reports/export?report=cash-flow&format=csv&from=2026-11-01&to=2026-11-30&granularity=week',
    )
    expect(exportPath('budgets', 'csv', p)).toBe('/reports/export?report=budgets&format=csv&month=2026-11')
    expect(exportPath('reconciliation', 'pdf', p)).toBe('/reports/export?report=reconciliation&format=pdf&statement_id=st1')
    expect(exportPath('accounts', 'csv', p)).toBe('/reports/export?report=accounts&format=csv&from=2026-11-01&to=2026-11-30')
  })
  it('names the file by report and params', () => {
    expect(exportFileName('merchants', 'csv', p)).toBe('merchants-2026-11-01_2026-11-30.csv')
    expect(exportFileName('budgets', 'pdf', p)).toBe('budgets-2026-11.pdf')
    expect(exportFileName('reconciliation', 'csv', p)).toBe('reconciliation-st1.csv')
  })
})

describe('months and granularity', () => {
  it('steps months across year boundaries', () => {
    expect(stepMonth('2026-11', 1)).toBe('2026-12')
    expect(stepMonth('2026-12', 1)).toBe('2027-01')
    expect(stepMonth('2026-01', -1)).toBe('2025-12')
    expect(stepMonth('garbage', 1)).toBe('garbage')
  })
  it('validates month strings', () => {
    expect(isMonth('2026-11')).toBe(true)
    expect(isMonth('2026-13')).toBe(false)
    expect(isMonth(undefined)).toBe(false)
  })
  it('picks a readable granularity', () => {
    expect(defaultGranularity({ from: '2026-11-01', to: '2026-11-30' })).toBe('day')
    expect(defaultGranularity({ from: '2026-09-01', to: '2026-11-30' })).toBe('week')
    expect(defaultGranularity({ from: '2026-01-01', to: '2026-11-30' })).toBe('month')
  })
  it('computes percentages with integer math', () => {
    expect(pctOf(1, 3)).toBe(33)
    expect(pctOf(2, 3)).toBe(67)
    expect(pctOf(5, 0)).toBe(0)
    expect(pct1(1, 3)).toBe('33.3')
    expect(pct1(1, 8)).toBe('12.5')
    expect(pct1(0, 0)).toBe('0.0')
  })
})
