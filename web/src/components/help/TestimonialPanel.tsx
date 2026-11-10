import { Loader2, Quote, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Panel } from '@/components/common/kit'
import { ErrorState, ListSkeleton } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage, isApiError } from '@/lib/api'
import { useDeleteTestimonial, useMyTestimonial, useSaveTestimonial } from '@/lib/queries'
import type { Testimonial } from '@/types/api'

const MIN = 20
const MAX = 300

const STATUS: Record<Testimonial['status'], { label: string; note: string }> = {
  pending: {
    label: 'Waiting for review',
    note: 'The administrator reads it before it appears on the home page.',
  },
  approved: { label: 'On the home page', note: 'Thank you! Changing it sends it back for review.' },
  hidden: { label: 'Not shown', note: 'The administrator chose not to show it. You can rewrite it.' },
}

/** The user's words for the public home page: one each, shown once approved. */
export function TestimonialPanel({ id }: { id?: string }) {
  const q = useMyTestimonial()
  const save = useSaveTestimonial()
  const remove = useDeleteTestimonial()
  const [draft, setDraft] = useState<string | null>(null)
  const mine = q.data ?? null
  const editing = draft !== null || (q.isSuccess && !mine)
  const text = draft ?? mine?.body ?? ''
  const length = text.trim().length
  const fieldError = isApiError(save.error) ? save.error.details.body : undefined

  return (
    <Panel
      id={id}
      eyebrow="For the home page"
      title="Recommend Xpenses"
      description="A sentence or two about how Xpenses helps you. With your name, it may appear on the public home page."
    >
      {q.isPending ? (
        <ListSkeleton rows={2} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
      ) : editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(text, {
              onSuccess: () => {
                setDraft(null)
                toast.success('Thank you! It will appear once the administrator has read it.')
              },
              onError: (err) => {
                if (!isApiError(err) || !err.details.body) toast.error(errorMessage(err, 'Could not save'))
              },
            })
          }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="testimonial-body" className="text-sm font-medium">
              In your words
            </label>
            <span className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">
              {length}/{MAX}
            </span>
          </div>
          <Textarea
            id="testimonial-body"
            rows={3}
            maxLength={MAX}
            value={text}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="I share my mBoB screen and the expense is already there…"
            aria-invalid={!!fieldError || undefined}
            className="text-base"
          />
          {fieldError ? (
            <p className="text-destructive text-xs">Testimonial: {fieldError}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Between {MIN} and {MAX} characters.
            </p>
          )}
          <div className="flex gap-2">
            {mine && (
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            )}
            <Button type="submit" className="flex-1" disabled={save.isPending || length < MIN}>
              {save.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
              {mine ? 'Save changes' : 'Submit for review'}
            </Button>
          </div>
        </form>
      ) : mine ? (
        <div className="flex flex-col gap-4">
          <figure className="border-saffron rounded-md border-l-[3px] pl-4">
            <Quote className="text-saffron mb-1 size-4" aria-hidden />
            <blockquote className="font-display text-lg leading-snug">{mine.body}</blockquote>
          </figure>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={mine.status === 'approved' ? 'outline' : 'secondary'}>
              {STATUS[mine.status].label}
            </Badge>
            <span className="text-muted-foreground text-xs">{STATUS[mine.status].note}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDraft(mine.body)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => toast.success('Removed'),
                  onError: (err) => toast.error(errorMessage(err)),
                })
              }
            >
              <Trash2 data-icon="inline-start" /> Remove
            </Button>
          </div>
        </div>
      ) : null}
    </Panel>
  )
}
