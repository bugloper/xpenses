import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authErrorInfo, type AuthErrorInfo } from '@/lib/auth'
import type { User } from '@/types/api'
import { FormAlert } from './FormAlert'
import { createAccountSchema, PASSWORD_MIN, type CreateAccountValues } from './schemas'
import { useRetryCountdown } from './useRetryCountdown'

export type CreateAccountPayload = { name: string; email: string; password: string }

/**
 * Name / email / password / confirm form shared by /setup and /register. The
 * caller supplies the mutation; error codes are mapped here.
 */
export function CreateAccountForm({
  submitLabel,
  pendingLabel,
  onSubmit,
  onSuccess,
  onError,
  idPrefix = 'account',
}: {
  submitLabel: string
  pendingLabel: string
  onSubmit: (payload: CreateAccountPayload) => Promise<User>
  onSuccess: (user: User) => void
  /** Return true to take over handling (e.g. already_set_up → go to /login). */
  onError?: (info: AuthErrorInfo) => boolean | void
  idPrefix?: string
}) {
  const [pending, setPending] = useState(false)
  const [formError, setFormError] = useState<AuthErrorInfo | null>(null)
  const secondsLeft = useRetryCountdown(formError)
  const form = useForm<CreateAccountValues>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: { name: '', email: '', password: '', confirm_password: '' },
  })

  const submit = form.handleSubmit(async (values) => {
    setFormError(null)
    setPending(true)
    try {
      const user = await onSubmit({ name: values.name, email: values.email, password: values.password })
      onSuccess(user)
    } catch (e) {
      const info = authErrorInfo(e)
      if (onError?.(info)) return
      if (info.field === 'email' || info.field === 'password' || info.field === 'name') {
        form.setError(info.field, { message: info.message })
        return
      }
      setFormError(info)
    } finally {
      setPending(false)
    }
  })

  const errors = form.formState.errors
  const throttled = secondsLeft > 0
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" noValidate>
      <FormAlert>{formError?.message}</FormAlert>
      <Field data-invalid={!!errors.name || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Name</FieldLabel>
        <Input
          className="h-11"
          id={`${idPrefix}-name`}
          autoComplete="name"
          autoFocus
          aria-invalid={!!errors.name}
          {...form.register('name')}
        />
        <FieldError errors={[errors.name]} />
      </Field>
      <Field data-invalid={!!errors.email || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-email`}>Email</FieldLabel>
        <Input
          className="h-11"
          id={`${idPrefix}-email`}
          type="email"
          inputMode="email"
          autoComplete="username"
          aria-invalid={!!errors.email}
          {...form.register('email')}
        />
        <FieldError errors={[errors.email]} />
      </Field>
      <Field data-invalid={!!errors.password || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-password`}>Password</FieldLabel>
        <Input
          className="h-11"
          id={`${idPrefix}-password`}
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          {...form.register('password')}
        />
        <FieldDescription>At least {PASSWORD_MIN} characters.</FieldDescription>
        <FieldError errors={[errors.password]} />
      </Field>
      <Field data-invalid={!!errors.confirm_password || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-confirm`}>Confirm password</FieldLabel>
        <Input
          className="h-11"
          id={`${idPrefix}-confirm`}
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirm_password}
          {...form.register('confirm_password')}
        />
        <FieldError errors={[errors.confirm_password]} />
      </Field>
      <Button
        type="submit"
        size="lg"
        className="mt-3 h-12 w-full text-[0.9375rem]"
        disabled={pending || throttled}
      >
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  )
}
