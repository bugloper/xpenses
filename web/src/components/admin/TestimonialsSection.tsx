import { Eye, EyeOff, Quote } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Panel } from '@/components/common/kit'
import { Segmented } from '@/components/common/Segmented'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/dates'
import { useAdminTestimonials, useReviewTestimonial } from '@/lib/queries'
import type { AdminTestimonial, TestimonialStatus } from '@/types/api'

type Filter = TestimonialStatus | 'all'

const LABEL: Record<TestimonialStatus, string> = {
  pending: 'Waiting',
  approved: 'On the home page',
  hidden: 'Hidden',
}

/** Testimonials users wrote for the home page: nothing shows until approved here. */
export function TestimonialsSection() {
  const [filter, setFilter] = useState<Filter>('pending')
  const q = useAdminTestimonials(filter)
  const list = q.data ?? []
  return (
    <Panel
      eyebrow="Home page"
      title="Testimonials"
      description="Approve a testimonial to show it, with the writer's name, on the public home page. Rewritten ones come back here."
      flush
    >
      <div className="border-b px-4 py-3 sm:px-5">
        <Segmented
          aria-label="Show"
          value={filter}
          onChange={setFilter}
          className="w-full sm:w-full"
          options={[
            { value: 'pending', label: 'Waiting' },
            { value: 'approved', label: 'Shown' },
            { value: 'hidden', label: 'Hidden' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      {q.isPending ? (
        <div className="p-4">
          <ListSkeleton rows={3} />
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Quote}
          title={filter === 'pending' ? 'Nothing to review' : 'Nothing here'}
          description={filter === 'pending' ? 'Testimonials users write land here.' : undefined}
        />
      ) : (
        <ul className="divide-rule divide-y">
          {list.map((t) => (
            <Item key={t.id} t={t} />
          ))}
        </ul>
      )}
    </Panel>
  )
}

function Item({ t }: { t: AdminTestimonial }) {
  const review = useReviewTestimonial()
  const act = (action: 'approve' | 'hide') =>
    review.mutate(
      { id: t.id, action },
      {
        onSuccess: () => toast.success(action === 'approve' ? 'Approved: it is on the home page' : 'Hidden'),
        onError: (err) => toast.error(errorMessage(err)),
      },
    )
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 truncate text-sm font-medium">{t.from.name}</span>
        <span className="text-muted-foreground min-w-0 truncate text-xs">{t.from.email}</span>
        <Badge variant={t.status === 'approved' ? 'outline' : 'secondary'} className="ml-auto">
          {LABEL[t.status]}
        </Badge>
      </div>
      <blockquote className="font-display border-saffron border-l-[3px] pl-3 text-lg leading-snug">
        {t.body}
      </blockquote>
      <p className="text-muted-foreground text-xs">
        Written {formatDateTime(t.updated_at)}
        {t.reviewed_by_name &&
          t.reviewed_at &&
          ` · reviewed by ${t.reviewed_by_name}, ${formatDateTime(t.reviewed_at)}`}
      </p>
      <div className="flex flex-wrap gap-2">
        {t.status !== 'approved' && (
          <Button size="sm" disabled={review.isPending} onClick={() => act('approve')}>
            <Eye data-icon="inline-start" /> Approve
          </Button>
        )}
        {t.status !== 'hidden' && (
          <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => act('hide')}>
            <EyeOff data-icon="inline-start" /> Hide
          </Button>
        )}
      </div>
    </li>
  )
}
