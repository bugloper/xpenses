import { createRoute } from '@tanstack/react-router'
import { Panel } from '@/components/common/kit'
import { PageHeader } from '@/components/common/PageHeader'
import { ErrorState, ListSkeleton } from '@/components/common/States'
import { FeedbackForm } from '@/components/help/FeedbackForm'
import { SentMessage } from '@/components/help/SentMessages'
import { TestimonialPanel } from '@/components/help/TestimonialPanel'
import { useMyFeedback } from '@/lib/queries'
import { appRoute } from './__root'

/**
 * Feedback & support: tell the administrator something, ask for a feature or
 * for help, read their answers, and write a few words for the home page.
 */
function HelpPage() {
  const q = useMyFeedback()
  const messages = q.data?.messages ?? []
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Help"
        title="Feedback & support"
        description="Something not working, an idea, or just a thought? Write to the administrator. Answers appear here."
      />
      <Panel eyebrow="Write to us" title="Send a message">
        <FeedbackForm />
      </Panel>
      <Panel
        eyebrow={messages.length ? `${messages.length} sent` : 'History'}
        title="What you have sent"
        flush
      >
        {q.isPending ? (
          <div className="p-4">
            <ListSkeleton rows={2} />
          </div>
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
        ) : messages.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-sm sm:px-5">
            Nothing yet. Your messages and the answers to them will show here.
          </p>
        ) : (
          <ul className="divide-rule divide-y">
            {messages.map((m) => (
              <SentMessage key={m.id} message={m} />
            ))}
          </ul>
        )}
      </Panel>
      <TestimonialPanel id="testimonial" />
    </div>
  )
}

export const helpRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/help',
  component: HelpPage,
})
