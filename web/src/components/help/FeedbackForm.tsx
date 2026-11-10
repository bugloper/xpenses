import { Loader2, Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Segmented } from '@/components/common/Segmented'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage, isApiError } from '@/lib/api'
import { useSendFeedback } from '@/lib/queries'
import type { FeedbackKindKey } from '@/types/api'

const MAX = 2000

const KINDS: { value: FeedbackKindKey; label: string }[] = [
  { value: 'feedback', label: 'Feedback' },
  { value: 'feature', label: 'Feature' },
  { value: 'support', label: 'Support' },
]

const PLACEHOLDER: Record<FeedbackKindKey, string> = {
  feedback: 'What do you like, and what gets in your way?',
  feature: 'What would you like Xpenses to do?',
  support: 'What went wrong? Which screen were you on?',
}

/**
 * Write to the administrator: feedback, a feature request, or a support
 * question. `kind` fixes the kind and hides the choice (the expired page only
 * asks for help).
 */
export function FeedbackForm({ kind: fixedKind, onSent }: { kind?: FeedbackKindKey; onSent?: () => void }) {
  const [kind, setKind] = useState<FeedbackKindKey>(fixedKind ?? 'feedback')
  const [body, setBody] = useState('')
  const send = useSendFeedback()
  const fieldError = isApiError(send.error) ? send.error.details.body : undefined
  const length = body.trim().length
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        send.mutate(
          { kind, body },
          {
            onSuccess: () => {
              setBody('')
              toast.success(
                kind === 'support' ? 'Sent. The administrator will get back to you.' : 'Sent. Thank you!',
              )
              onSent?.()
            },
            onError: (err) => {
              if (!isApiError(err) || !err.details.body) toast.error(errorMessage(err, 'Could not send'))
            },
          },
        )
      }}
    >
      {!fixedKind && (
        <Segmented
          aria-label="What is it?"
          value={kind}
          onChange={setKind}
          options={KINDS}
          size="lg"
          className="w-full sm:w-full"
        />
      )}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="feedback-body" className="text-sm font-medium">
            Message
          </label>
          <span className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">
            {length}/{MAX}
          </span>
        </div>
        <Textarea
          id="feedback-body"
          rows={5}
          maxLength={MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={PLACEHOLDER[kind]}
          aria-invalid={!!fieldError || undefined}
          className="min-h-32 text-base"
        />
        {fieldError && <p className="text-destructive text-xs">Message {fieldError}</p>}
      </div>
      <Button type="submit" size="lg" disabled={send.isPending || length === 0}>
        {send.isPending ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : (
          <Send data-icon="inline-start" />
        )}
        Send
      </Button>
    </form>
  )
}
