import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { RoleBadge } from '@/components/auth/UserBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { performLogout, useUpdateProfile } from '@/lib/queries/auth'
import { uiStore } from '@/lib/ui-store'
import { useNavigate } from '@tanstack/react-router'
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

/** Profile + password + sign-out controls on the Settings page. */
export function AccountSection() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [confirmAll, setConfirmAll] = useState(false)
  if (!user) return null
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card ring-foreground/10 divide-y rounded-2xl px-4 ring-1">
        <div className="flex items-center gap-2 py-4">
          <p className="text-sm font-medium">Signed in as {user.name}</p>
          <RoleBadge user={user} />
        </div>
        {/* Keyed on the server value so an external rename resets the draft. */}
        <ProfileRows key={user.name} name={user.name} email={user.email} />
      </div>
      <div className="bg-card ring-foreground/10 rounded-2xl p-4 ring-1">
        <h3 className="mb-3 text-sm font-medium">Change password</h3>
        <ChangePasswordForm />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => uiStore.requestLogout()}>
          <LogOut data-icon="inline-start" /> Log out
        </Button>
        <Button variant="ghost" className="text-destructive" onClick={() => setConfirmAll(true)}>
          Log out everywhere
        </Button>
      </div>
      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title="Log out of every device?"
        description="All sessions, including this one, will be signed out. Unsynced transactions on this device are kept until you sign in again."
        confirmLabel="Log out everywhere"
        destructive
        onConfirm={async () => {
          try {
            await performLogout({ everywhere: true })
            await navigate({ to: '/login', search: {}, replace: true })
          } catch (e) {
            toast.error(errorMessage(e, 'Could not log out'))
          }
        }}
      />
    </div>
  )
}
