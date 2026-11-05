import { useState } from 'react'
import { toast } from 'sonner'
import { RoleBadge } from '@/components/auth/UserBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useUpdateProfile } from '@/lib/queries/auth'
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

/** Who is signed in, with the editable name. */
export function ProfileSection() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <div className="bg-card border divide-y rounded-[1.25rem] px-4">
      <div className="flex items-center gap-2 py-4">
        <p className="text-sm font-medium">Signed in as {user.name}</p>
        <RoleBadge user={user} />
      </div>
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
