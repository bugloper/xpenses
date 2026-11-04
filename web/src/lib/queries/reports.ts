import { useQuery } from '@tanstack/react-query'
import { api, toQuery } from '@/lib/api'
import type {
  FlowType,
  ReportAccount,
  ReportBudget,
  ReportCashFlow,
  ReportCategory,
  ReportMerchant,
  ReportSummary,
} from '@/types/api'
import { keys } from './keys'

export function useReportSummary(from: string, to: string) {
  return useQuery({
    queryKey: keys.reports.summary(from, to),
    queryFn: ({ signal }) => api.get<ReportSummary>(`/reports/summary${toQuery({ from, to })}`, signal),
  })
}

export function useReportCategories(from: string, to: string, type: FlowType = 'expense') {
  return useQuery({
    queryKey: keys.reports.categories(from, to, type),
    queryFn: ({ signal }) =>
      api.get<ReportCategory[]>(`/reports/categories${toQuery({ from, to, type })}`, signal),
  })
}

export function useReportCashFlow(from: string, to: string, granularity: 'day' | 'week' | 'month') {
  return useQuery({
    queryKey: keys.reports.cashFlow(from, to, granularity),
    queryFn: ({ signal }) =>
      api.get<ReportCashFlow[]>(`/reports/cash-flow${toQuery({ from, to, granularity })}`, signal),
  })
}

export function useReportBudgets(month: string) {
  return useQuery({
    queryKey: keys.reports.budgets(month),
    queryFn: ({ signal }) => api.get<ReportBudget[]>(`/reports/budgets${toQuery({ month })}`, signal),
  })
}

export function useReportMerchants(from: string, to: string, type: FlowType = 'expense') {
  return useQuery({
    queryKey: keys.reports.merchants(from, to, type),
    queryFn: ({ signal }) =>
      api.get<ReportMerchant[]>(`/reports/merchants${toQuery({ from, to, type })}`, signal),
  })
}

export function useReportAccounts(from: string, to: string) {
  return useQuery({
    queryKey: keys.reports.accounts(from, to),
    queryFn: ({ signal }) => api.get<ReportAccount[]>(`/reports/accounts${toQuery({ from, to })}`, signal),
  })
}

