import { useQuery } from '@tanstack/react-query'
import { api, toQuery } from '@/lib/api'
import type { ReportLoanActivity, ReportSavingsActivity } from '@/types/api'

// Monthly loan and savings activity. Keyed under 'reports' (so writing a
// transaction refreshes them) and under loans/savings (so goal entries do).

export function useReportLoans(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'loans', { from, to }],
    queryFn: ({ signal }) => api.get<ReportLoanActivity[]>(`/reports/loans${toQuery({ from, to })}`, signal),
  })
}

export function useReportSavings(from: string, to: string) {
  return useQuery({
    queryKey: ['savings', 'report', { from, to }],
    queryFn: ({ signal }) =>
      api.get<ReportSavingsActivity[]>(`/reports/savings${toQuery({ from, to })}`, signal),
  })
}
