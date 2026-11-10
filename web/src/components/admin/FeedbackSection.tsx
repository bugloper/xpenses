import { CheckCheck, Loader2, Mail, Reply } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Panel } from '@/components/common/kit'
import { Segmented } from '@/components/common/Segmented'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { FeedbackStatusBadge } from '@/components/help/SentMessages'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/dates'
import { useAcknowledgeFeedback, useAdminFeedback, useReplyToFeedback } from '@/lib/queries'
import type { AdminFeedbackMessage } from '@/types/api'

type Filter = 'new' | 'acknowledged' | 'replied' | 'all'

/** The administrator's inbox: messages from users, newest first; mark seen, answer once. */
export function FeedbackSection() {
  const [filter, setFilter] = useState<Filter>('new')
  const q = useAdminFeedback(filter)
  const list = q.data ?? []
  return (
    <Panel
      eyebrow="Inbox"
      title="Feedback & support"
      description="What users send from their Feedback & support page. Your answer appears there."
      flush
    >
      <div className="border-b px-4 py-3 sm:px-5">
        <Segmented
          aria-label="Show"
          value={filter}
          onChange={setFilter}
          className="w-full sm:w-full"
          options={[
            { value: 'new', label: 'New' },
            { value: 'acknowledged', label: 'Seen' },
            { value: 'replied', label: 'Answered' },
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
          icon={Mail}
          title={filter === 'new' ? 'Nothing new' : 'Nothing here'}
          description={filter === 'new' ? 'New messages from users land here.' : undefined}
        />
      ) : (
        <ul className="divide-rule divide-y">
          {list.map((m) => (
            <InboxMessage key={m.id} message={m} />
          ))}
        </ul>
      )}
    </Panel>
  )
}

function InboxMessage({ message: m }: { message: AdminFeedbackMessage }) {
  const ack = useAcknowledgeFeedback()
  const reply = useReplyToFeedback()
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={m.kind === 'support' ? 'destructive' : 'outline'}>{m.kind_label}</Badge>
        <span className="min-w-0 truncate text-sm font-medium">{m.from.name}</span>
        <a
          href={`mailto:${m.from.email}`}
          className="text-muted-foreground min-w-0 truncate text-xs hover:underline"
        >
          {m.from.email}
        </a>
        <span className="ml-auto">
          <FeedbackStatusBadge status={m.status} admin />
        </span>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
      <p className="text-muted-foreground text-xs">
        {formatDateTime(m.created_at)}
        {m.reviewed_by_name && ` · handled by ${m.reviewed_by_name}`}
      </p>
      {m.reply ? (
        <div className="border-saffron bg-saffron-soft/40 rounded-md border-l-[3px] px-3.5 py-3">
          <div className="text-accent-foreground text-xs font-semibold">
            Your reply{m.replied_at && <span className="font-normal"> · {formatDateTime(m.replied_at)}</span>}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{m.reply}</p>
        </div>
      ) : draft !== null ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            reply.mutate(
              { id: m.id, reply: draft },
              {
                onSuccess: () => {
                  setDraft(null)
                  toast.success('Reply sent')
                },
                onError: (err) => toast.error(errorMessage(err, 'Could not send the reply')),
              },
            )
          }}
        >
          <label htmlFor={`reply-${m.id}`} className="sr-only">
            Reply to {m.from.name}
          </label>
          <Textarea
            id={`reply-${m.id}`}
            rows={3}
            maxLength={2000}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Answer ${m.from.name}…`}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={reply.isPending || draft.trim() === ''}>
              {reply.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Send reply
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setDraft('')}>
            <Reply data-icon="inline-start" /> Reply
          </Button>
          {m.status === 'new' && (
            <Button
              size="sm"
              variant="outline"
              disabled={ack.isPending}
              onClick={() =>
                ack.mutate(m.id, {
                  onSuccess: () => toast.success('Marked as seen'),
                  onError: (err) => toast.error(errorMessage(err)),
                })
              }
            >
              <CheckCheck data-icon="inline-start" /> Mark seen
            </Button>
          )}
        </div>
      )}
    </li>
  )
}
