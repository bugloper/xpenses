import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Settings } from '@/types/api'
import { keys } from './keys'

export function useSettings() {
  return useQuery({
    queryKey: keys.settings.all,
    queryFn: ({ signal }) => api.get<Settings>('/settings', signal),
    staleTime: 5 * 60_000,
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Record<string, string>) => api.patch<Settings>('/settings', patch),
    onSuccess: (data, patch) => {
      qc.setQueryData(keys.settings.all, data)
      // The tolerance changes which manual transactions the workspace suggests.
      if ('reconciliation.date_tolerance_days' in patch)
        void qc.invalidateQueries({ queryKey: keys.reconciliation.all })
    },
  })
}

export function useDefaultCurrency(): string {
  const { data } = useSettings()
  return data?.default_currency || 'BTN'
}
