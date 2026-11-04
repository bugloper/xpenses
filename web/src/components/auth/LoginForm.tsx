import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authErrorInfo, type AuthErrorInfo } from '@/lib/auth'
import { useLogin } from '@/lib/queries/auth'
import type { User } from '@/types/api'
import { FormAlert } from './FormAlert'
import { loginSchema, type LoginValues } from './schemas'
import { useRetryCountdown } from './useRetryCountdown'

export function LoginForm({
  onSuccess,
  onSetupRequired,
}: {
  onSuccess: (user: User) => void
  /** The server has no users yet: the page should go to /setup. */
  onSetupRequired: () => void
}) {
  const login = useLogin()
  const [formError, setFormError] = useState<AuthErrorInfo | null>(null)
  const secondsLeft = useRetryCountdown(formError)
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const submit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      const user = await login.mutateAsync({ email: values.email, password: values.password })
      onSuccess(user)
    } catch (e) {
      const info = authErrorInfo(e)
      if (info.setupRequired) {
        onSetupRequired()
        return
      }
      if (info.field === 'email' || info.field === 'password') {
        form.setError(info.field, { message: info.message })
        return
      }
      setFormError(info)
    }
  })

  const throttled = secondsLeft > 0
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
      <FormAlert>
        {formError &&
          (throttled && formError.retryAfter
            ? `Too many attempts. Try again in ${secondsLeft} second${secondsLeft === 1 ? '' : 's'}.`
            : formError.message)}
      </FormAlert>
      <Field data-invalid={!!form.formState.errors.email || undefined}>
        <FieldLabel htmlFor="login-email">Email</FieldLabel>
        <Input
          id="login-email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoFocus
          aria-invalid={!!form.formState.errors.email}
          {...form.register('email')}
        />
        <FieldError errors={[form.formState.errors.email]} />
      </Field>
      <Field data-invalid={!!form.formState.errors.password || undefined}>
        <FieldLabel htmlFor="login-password">Password</FieldLabel>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!form.formState.errors.password}
          {...form.register('password')}
        />
        <FieldError errors={[form.formState.errors.password]} />
      </Field>
      <Button
        type="submit"
        size="lg"
        className="mt-2 h-11 rounded-xl"
        disabled={login.isPending || throttled}
      >
        {login.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
