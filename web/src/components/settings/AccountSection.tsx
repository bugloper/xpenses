import { Camera, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Avatar, RoleBadge } from '@/components/auth/UserBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/api'
import { attachmentProblem } from '@/lib/attachments'
import { useAuth } from '@/lib/auth'
import { useRemoveAvatar, useUpdateProfile, useUploadAvatar } from '@/lib/queries/auth'
import type { User } from '@/types/api'
import { ChangePasswordForm } from './ChangePasswordForm'

function Row({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
      <div className="sm:w-72">{children}</div>
    </div>
  )
}

function ProfileRows({ name: initialName, email }: { name: string; email: string }) {
  const update = useUpdateProfile()
  const [name, setName] = useState(initialName)
  const trimmed = name.trim()
  return (
    <>
      <Row label="Name" description="Shown in the sidebar and to the administrator.">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!trimmed) return
            update.mutate(
              { name: trimmed },
              {
                onSuccess: () => toast.success('Profile saved'),
                onError: (err) => toast.error(errorMessage(err)),
              },
            )
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" maxLength={100} />
          <Button
            type="submit"
            variant="outline"
            disabled={update.isPending || !trimmed || trimmed === initialName}
          >
            Save
          </Button>
        </form>
      </Row>
      <Row label="Email" description="Used to sign in. Cannot be changed.">
        <Input value={email} readOnly aria-label="Email" className="text-muted-foreground" />
      </Row>
    </>
  )
}

/** The picture beside the name: pick a new one, or go back to initials. */
function PhotoRow({ user }: { user: User }) {
  const input = useRef<HTMLInputElement>(null)
  const upload = useUploadAvatar()
  const remove = useRemoveAvatar()
  const busy = upload.isPending || remove.isPending
  const pick = (f: File | undefined) => {
    if (!f) return
    const problem = attachmentProblem(f)
    if (problem) {
      toast.error(problem)
      return
    }
    upload.mutate(f, {
      onSuccess: () => toast.success('Profile picture updated'),
      onError: (e) => toast.error(errorMessage(e)),
    })
  }
  return (
    <div className="flex items-center gap-4 py-4">
      <Avatar user={user} className="size-16 text-lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">Signed in as {user.name}</p>
          <RoleBadge user={user} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Choose a profile picture"
            onChange={(e) => {
              pick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            <Camera data-icon="inline-start" /> {upload.isPending ? 'Uploading…' : user.avatar_updated_at ? 'Change photo' : 'Add photo'}
          </Button>
          {user.avatar_updated_at && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => toast.success('Profile picture removed'),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              <Trash2 data-icon="inline-start" /> Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Who is signed in, with the picture and the editable name. */
export function ProfileSection() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <div className="bg-card border divide-y rounded-[1.25rem] px-4">
      <PhotoRow user={user} />
      {/* Keyed on the server value so an external rename resets the draft. */}
      <ProfileRows key={user.name} name={user.name} email={user.email} />
    </div>
  )
}

/** The change-password form in its own panel. */
export function PasswordSection() {
  return (
    <div className="bg-card border rounded-[1.25rem] p-4">
      <ChangePasswordForm />
    </div>
  )
}
