// Feedback & support, and testimonials: the user's side, the home page's
// public list, and the administrator's review queues.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, request } from '@/lib/api'
import type {
  AdminFeedbackMessage,
  AdminTestimonial,
  CommunityCounts,
  FeedbackKindKey,
  FeedbackMessage,
  MyFeedback,
  PublicTestimonial,
  Testimonial,
} from '@/types/api'

export const communityKeys = {
  feedback: ['community', 'feedback'] as const,
  testimonial: ['community', 'testimonial'] as const,
  public: ['community', 'public-testimonials'] as const,
  admin: ['community', 'admin'] as const,
  adminCounts: ['community', 'admin', 'counts'] as const,
  adminFeedback: (status: string) => ['community', 'admin', 'feedback', status] as const,
  adminTestimonials: (status: string) => ['community', 'admin', 'testimonials', status] as const,
}

// Messages and replies change on the server; nothing here is kept offline.
const fresh = { meta: { persist: false } } as const

export function useMyFeedback() {
  return useQuery({
    ...fresh,
    queryKey: communityKeys.feedback,
    queryFn: ({ signal }) => api.get<MyFeedback>('/feedback', signal),
  })
}

export function useSendFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { kind: FeedbackKindKey; body: string }) =>
      api.post<FeedbackMessage>('/feedback', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: communityKeys.feedback }),
  })
}

export function useMyTestimonial() {
  return useQuery({
    ...fresh,
    queryKey: communityKeys.testimonial,
    queryFn: ({ signal }) => api.get<Testimonial | null>('/testimonial', signal),
  })
}

export function useSaveTestimonial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: string) =>
      request<{ data: Testimonial }>('/testimonial', { method: 'PUT', body: { body } }).then((r) => r.data),
    onSuccess: (t) => qc.setQueryData(communityKeys.testimonial, t),
  })
}

export function useDeleteTestimonial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete('/testimonial'),
    onSuccess: () => qc.setQueryData(communityKeys.testimonial, null),
  })
}

/** The approved testimonials for the public home page (no session needed). */
export function usePublicTestimonials() {
  return useQuery({
    ...fresh,
    queryKey: communityKeys.public,
    queryFn: ({ signal }) => api.get<PublicTestimonial[]>('/public/testimonials', signal),
    staleTime: 5 * 60_000,
  })
}

export function useCommunityCounts() {
  return useQuery({
    ...fresh,
    queryKey: communityKeys.adminCounts,
    queryFn: ({ signal }) => api.get<CommunityCounts>('/admin/community', signal),
  })
}

export function useAdminFeedback(status: string) {
  return useQuery({
    ...fresh,
    queryKey: communityKeys.adminFeedback(status),
    queryFn: ({ signal }) =>
      api.get<AdminFeedbackMessage[]>(
        `/admin/feedback${status === 'all' ? '' : `?status=${status}`}`,
        signal,
      ),
  })
}

export function useAdminTestimonials(status: string) {
  return useQuery({
    ...fresh,
    queryKey: communityKeys.adminTestimonials(status),
    queryFn: ({ signal }) =>
      api.get<AdminTestimonial[]>(
        `/admin/testimonials${status === 'all' ? '' : `?status=${status}`}`,
        signal,
      ),
  })
}

/** Every review action refreshes the queues and the waiting counts. */
function useReview<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: communityKeys.admin })
      void qc.invalidateQueries({ queryKey: communityKeys.public })
    },
  })
}

export const useAcknowledgeFeedback = () =>
  useReview((id: string) => api.post(`/admin/feedback/${id}/acknowledge`))
export const useReplyToFeedback = () =>
  useReview(({ id, reply }: { id: string; reply: string }) =>
    api.post(`/admin/feedback/${id}/reply`, { reply }),
  )
export const useReviewTestimonial = () =>
  useReview(({ id, action }: { id: string; action: 'approve' | 'hide' }) =>
    api.post(`/admin/testimonials/${id}/${action}`),
  )
