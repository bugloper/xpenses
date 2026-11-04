import { useRegister } from '@/lib/queries/auth'
import type { User } from '@/types/api'
import { CreateAccountForm } from './CreateAccountForm'

/** Registration form; `inviteToken` (from `?invite=`) is forwarded as `invite_token`. */
export function RegisterForm({
  inviteToken,
  onSuccess,
}: {
  inviteToken?: string
  onSuccess: (user: User) => void
}) {
  const register = useRegister()
  return (
    <CreateAccountForm
      idPrefix="register"
      submitLabel="Create account"
      pendingLabel="Creating account…"
      onSubmit={(p) => register.mutateAsync(inviteToken ? { ...p, invite_token: inviteToken } : p)}
      onSuccess={onSuccess}
    />
  )
}
