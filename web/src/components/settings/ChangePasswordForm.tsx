import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { FormAlert } from '@/components/auth/FormAlert'
import { changePasswordSchema, PASSWORD_MIN, type ChangePasswordValues } from '@/components/auth/schemas'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authErrorInfo } from '@/lib/auth'
import { useChangePassword } from '@/lib/queries/auth'

export function ChangePasswordForm() {
  const change = useChangePassword()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })
  const errors = form.formState.errors

  const submit = form.handleSubmit(async (v) => {
    setFormError(null)
    try {
      await change.mutateAsync({ current_password: v.current_password, new_password: v.new_password })
      form.reset()
      toast.success('Password changed', { description: 'Your other sessions were signed out.' })
    } catch (e) {
      const info = authErrorInfo(e)
      // PATCH /auth/password answers 401 invalid_credentials when the current password is wrong.
      if (info.field === 'password' || info.field === 'current_password') {
        form.setError('current_password', { message: 'Incorrect current password' })
        return
      }
      if (info.field === 'new_password') {
        form.setError('new_password', { message: info.message })
        return
      }
      setFormError(info.message)
    }
  })

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-4" noValidate>
      {formError && <FormAlert>{formError}</FormAlert>}
      <Field data-invalid={!!errors.current_password || undefined}>
        <FieldLabel htmlFor="pw-current">Current password</FieldLabel>
        <Input
          id="pw-current"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.current_password}
          {...form.register('current_password')}
        />
        <FieldError errors={[errors.current_password]} />
      </Field>
      <Field data-invalid={!!errors.new_password || undefined}>
        <FieldLabel htmlFor="pw-new">New password</FieldLabel>
        <Input
          id="pw-new"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.new_password}
          {...form.register('new_password')}
        />
        <FieldDescription>At least {PASSWORD_MIN} characters.</FieldDescription>
        <FieldError errors={[errors.new_password]} />
      </Field>
      <Field data-invalid={!!errors.confirm_password || undefined}>
        <FieldLabel htmlFor="pw-confirm">Confirm new password</FieldLabel>
        <Input
          id="pw-confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirm_password}
          {...form.register('confirm_password')}
        />
        <FieldError errors={[errors.confirm_password]} />
      </Field>
      <div>
        <Button type="submit" variant="outline" disabled={change.isPending}>
          {change.isPending ? 'Changing…' : 'Change password'}
        </Button>
      </div>
    </form>
  )
}
