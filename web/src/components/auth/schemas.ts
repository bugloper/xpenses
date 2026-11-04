import { z } from 'zod'

export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 200

export const emailField = z.string().trim().min(1, 'Enter your email').email('Enter a valid email address')
export const passwordField = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`)
export const nameField = z.string().trim().min(1, 'Enter your name').max(100, 'Too long')

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const createAccountSchema = z
  .object({
    name: nameField,
    email: emailField,
    password: passwordField,
    confirm_password: z.string(),
  })
  .refine((v) => v.password === v.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match',
  })
export type CreateAccountValues = z.infer<typeof createAccountSchema>

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password'),
    new_password: passwordField,
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match',
  })
  .refine((v) => v.new_password !== v.current_password, {
    path: ['new_password'],
    message: 'Choose a different password',
  })
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>
