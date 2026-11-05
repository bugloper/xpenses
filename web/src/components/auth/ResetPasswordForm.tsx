import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authErrorInfo } from '@/lib/auth'
import { useResetPassword } from '@/lib/queries/auth'
import { FormAlert } from './FormAlert'
import { PASSWORD_MIN, resetPasswordSchema, type ResetPasswordValues } from './schemas'

/** Choose a new password with the token from an admin-issued reset link. */
export function ResetPasswordForm({ token, onSuccess }: { token: string; onSuccess: () => void }) {
  const reset = useResetPassword()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { new_password: '', confirm_password: '' },
  })
  const errors = form.formState.errors

  const submit = form.handleSubmit(async (v) => {
    setFormError(null)
    try {
      await reset.mutateAsync({ token, new_password: v.new_password })
      onSuccess()
    } catch (e) {
      const info = authErrorInfo(e)
      if (info.field === 'new_password') {
        form.setError('new_password', { message: info.message })
        return
      }
      setFormError(info.message)
    }
  })

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
      <FormAlert>{formError}</FormAlert>
      <Field data-invalid={!!errors.new_password || undefined}>
        <FieldLabel htmlFor="reset-new">New password</FieldLabel>
        <Input
          id="reset-new"
          type="password"
          autoComplete="new-password"
          autoFocus
          aria-invalid={!!errors.new_password}
          {...form.register('new_password')}
        />
        <FieldDescription>At least {PASSWORD_MIN} characters.</FieldDescription>
        <FieldError errors={[errors.new_password]} />
      </Field>
      <Field data-invalid={!!errors.confirm_password || undefined}>
        <FieldLabel htmlFor="reset-confirm">Confirm new password</FieldLabel>
        <Input
          id="reset-confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirm_password}
          {...form.register('confirm_password')}
        />
        <FieldError errors={[errors.confirm_password]} />
      </Field>
      <Button type="submit" size="lg" className="mt-2 h-11 rounded-xl" disabled={reset.isPending}>
        {reset.isPending ? 'Saving…' : 'Set new password'}
      </Button>
    </form>
  )
}
