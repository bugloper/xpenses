import { useSetup } from '@/lib/queries/auth'
import type { User } from '@/types/api'
import { CreateAccountForm } from './CreateAccountForm'

/** First-run form: creates the admin account. */
export function SetupForm({
  onSuccess,
  onAlreadySetUp,
}: {
  onSuccess: (user: User) => void
  onAlreadySetUp: () => void
}) {
  const setup = useSetup()
  return (
    <CreateAccountForm
      idPrefix="setup"
      submitLabel="Create admin account"
      pendingLabel="Creating account…"
      onSubmit={(p) => setup.mutateAsync(p)}
      onSuccess={onSuccess}
      onError={(info) => {
        if (info.alreadySetUp) {
          onAlreadySetUp()
          return true
        }
        return false
      }}
    />
  )
}
