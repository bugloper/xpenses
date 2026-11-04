import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, toQuery } from '@/lib/api'
import type { Category, CreateCategoryRequest, UpdateCategoryRequest } from '@/types/api'
import { keys } from './keys'

export function useCategories(includeInactive = false) {
  return useQuery({
    queryKey: keys.categories.list(includeInactive),
    queryFn: ({ signal }) =>
      api.get<Category[]>(`/categories${toQuery({ include_inactive: includeInactive })}`, signal),
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCategoryRequest) => api.post<Category>('/categories', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.categories.all }),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateCategoryRequest & { id: string }) =>
      api.patch<Category>(`/categories/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.categories.all })
      void qc.invalidateQueries({ queryKey: keys.reports.all })
      // Name/icon/colour are denormalised onto transaction rows.
      void qc.invalidateQueries({ queryKey: keys.transactions.all })
    },
  })
}
