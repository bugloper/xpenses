import { CheckCheck, MessageSquareReply } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/dates'
import type { FeedbackMessage } from '@/types/api'

/** `admin` words the unanswered state for the inbox ("New") rather than for the sender ("Sent"). */
export function FeedbackStatusBadge({
  status,
  admin,
}: {
  status: FeedbackMessage['status']
  admin?: boolean
}) {
  if (status === 'replied')
    return (
      <Badge variant="outline" className="border-paid/40 text-income">
        Replied
      </Badge>
    )
  if (status === 'acknowledged')
    return (
      <Badge variant="outline" className="border-saffron/50 text-accent-foreground">
        <CheckCheck /> Seen
      </Badge>
    )
  return <Badge variant="secondary">{admin ? 'New' : 'Sent'}</Badge>
}

/** One message as its sender sees it, with the administrator's answer under it. */
export function SentMessage({ message: m }: { message: FeedbackMessage }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{m.kind_label}</Badge>
        <span className="text-muted-foreground text-xs">{formatDateTime(m.created_at)}</span>
        <span className="ml-auto">
          <FeedbackStatusBadge status={m.status} />
        </span>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
      {m.reply && (
        <div className="border-saffron bg-saffron-soft/40 rounded-md border-l-[3px] px-3.5 py-3">
          <div className="text-accent-foreground flex items-center gap-1.5 text-xs font-semibold">
            <MessageSquareReply className="size-3.5" /> Reply
            {m.replied_at && <span className="font-normal">· {formatDateTime(m.replied_at)}</span>}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{m.reply}</p>
        </div>
      )}
    </li>
  )
}
