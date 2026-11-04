import { Check, Copy, Link2, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState, ErrorState } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/api'
import { relativeTime } from '@/lib/dates'
import { useCreateInvite, useInvites, useRevokeInvite } from '@/lib/queries/auth'
import type { CreatedInvite, Invite } from '@/types/api'

export type InviteStatus = 'pending' | 'used' | 'expired'
export function inviteStatus(i: Pick<Invite, 'used_at' | 'expires_at'>, now = Date.now()): InviteStatus {
  if (i.used_at) return 'used'
  if (new Date(i.expires_at).getTime() <= now) return 'expired'
  return 'pending'
}

/** Full URL a new user opens; `register_path` comes from the server. */
export function inviteUrl(created: Pick<CreatedInvite, 'register_path'>, origin = window.location.origin) {
  return origin + created.register_path
}

function CreateInviteDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: (i: CreatedInvite) => void
}) {
  const create = useCreateInvite()
  const [email, setEmail] = useState('')
  const [hours, setHours] = useState('72')
  const h = Number(hours)
  const valid = Number.isInteger(h) && h >= 1 && h <= 720
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid) return
            create.mutate(
              { email: email.trim() || undefined, expires_in_hours: h },
              {
                onSuccess: (i) => {
                  setEmail('')
                  setHours('72')
                  onCreated(i)
                },
                onError: (err) => toast.error(errorMessage(err)),
              },
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>New invite</DialogTitle>
            <DialogDescription>Creates a one-time registration link.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="invite-email">Email (optional)</FieldLabel>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
            />
            <FieldDescription>For your records only; the link works for whoever opens it.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="invite-hours">Expires in (hours)</FieldLabel>
            <Input
              id="invite-hours"
              type="number"
              min={1}
              max={720}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              aria-invalid={!valid}
            />
            <FieldDescription>1 to 720 hours (30 days). Default 72.</FieldDescription>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create invite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function InviteLinkDialog({ invite, onClose }: { invite: CreatedInvite | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const url = invite ? inviteUrl(invite) : ''
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy. Select the link and copy it manually.')
    }
  }
  return (
    <Dialog open={invite !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite link</DialogTitle>
          <DialogDescription>
            This link is shown once. Copy it now; it cannot be retrieved later, only revoked.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={url} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
          <Button type="button" onClick={() => void copy()} aria-label="Copy invite link">
            {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        {invite && (
          <p className="text-muted-foreground text-xs">
            {invite.email ? `For ${invite.email} · ` : ''}expires {relativeTime(invite.expires_at)}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const STATUS_BADGE: Record<
  InviteStatus,
  { label: string; variant: 'secondary' | 'outline' | 'destructive' }
> = {
  pending: { label: 'Pending', variant: 'secondary' },
  used: { label: 'Used', variant: 'outline' },
  expired: { label: 'Expired', variant: 'destructive' },
}

export function InvitesSection() {
  const { data, isPending, error, refetch } = useInvites()
  const revoke = useRevokeInvite()
  const [createOpen, setCreateOpen] = useState(false)
  const [created, setCreated] = useState<CreatedInvite | null>(null)
  const [doomed, setDoomed] = useState<Invite | null>(null)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus data-icon="inline-start" /> New invite
        </Button>
      </div>
      {isPending ? (
        <Skeleton className="h-24 w-full rounded-2xl" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} compact />
      ) : data.length === 0 ? (
        <div className="bg-card ring-foreground/10 rounded-2xl ring-1">
          <EmptyState icon={Link2} title="No invites" description="Create one to let someone register." />
        </div>
      ) : (
        <div className="bg-card ring-foreground/10 rounded-2xl px-4 ring-1">
          <ul className="divide-y">
            {data.map((i) => {
              const status = inviteStatus(i)
              const badge = STATUS_BADGE[status]
              return (
                <li key={i.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{i.email || 'Anyone with the link'}</p>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Created {relativeTime(i.created_at)}
                      {status === 'used'
                        ? ` · used${i.used_by_email ? ` by ${i.used_by_email}` : ''} ${i.used_at ? relativeTime(i.used_at) : ''}`
                        : status === 'expired'
                          ? ` · expired ${relativeTime(i.expires_at)}`
                          : ` · expires ${relativeTime(i.expires_at)}`}
                    </p>
                  </div>
                  {status === 'pending' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      aria-label={`Revoke invite${i.email ? ` for ${i.email}` : ''}`}
                      onClick={() => setDoomed(i)}
                    >
                      <X data-icon="inline-start" /> Revoke
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <CreateInviteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(i) => {
          setCreateOpen(false)
          setCreated(i)
        }}
      />
      <InviteLinkDialog invite={created} onClose={() => setCreated(null)} />
      <ConfirmDialog
        open={doomed !== null}
        onOpenChange={(o) => !o && setDoomed(null)}
        title="Revoke this invite?"
        description="The link stops working immediately."
        confirmLabel="Revoke"
        destructive
        loading={revoke.isPending}
        onConfirm={async () => {
          if (!doomed) return
          try {
            await revoke.mutateAsync(doomed.id)
            toast.success('Invite revoked')
          } catch (e) {
            toast.error(errorMessage(e))
          }
        }}
      />
    </div>
  )
}
