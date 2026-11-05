import { Link, Outlet, createRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { ForgotPasswordDialog } from '@/components/auth/ForgotPasswordDialog'
import { LoginForm } from '@/components/auth/LoginForm'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import { SetupForm } from '@/components/auth/SetupForm'
import { parseLoginSearch, parseRegisterSearch, parseResetSearch, safeRedirect } from '@/lib/auth'
import { useAuthStatus } from '@/lib/queries/auth'
import { rootRoute } from './__root'

/** Pathless layout for the public auth pages (no sidebar / bottom nav). */
export const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth',
  component: Outlet,
})

function LoginPage() {
  const navigate = useNavigate()
  const { redirect } = loginRoute.useSearch()
  const status = useAuthStatus()
  const registrationOpen = status.data?.registration_open ?? false
  const [forgot, setForgot] = useState(false)
  return (
    <AuthLayout
      title="Sign in"
      description="Welcome back. Enter your email and password."
      footer={
        registrationOpen ? (
          <>
            New here?{' '}
            <Link to="/register" search={{}} className="text-primary font-medium hover:underline">
              Create an account
            </Link>
          </>
        ) : undefined
      }
    >
      <LoginForm
        onSuccess={() => void navigate({ href: safeRedirect(redirect), replace: true })}
        onSetupRequired={() => void navigate({ to: '/setup', replace: true })}
        onForgotPassword={() => setForgot(true)}
      />
      <ForgotPasswordDialog open={forgot} onOpenChange={setForgot} />
    </AuthLayout>
  )
}

export const loginRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/login',
  validateSearch: parseLoginSearch,
  component: LoginPage,
})

function SetupPage() {
  const navigate = useNavigate()
  return (
    <AuthLayout
      title="Set up Xpenses"
      description="Create the first account. It becomes the administrator of this instance."
    >
      <SetupForm
        onSuccess={() => void navigate({ to: '/', replace: true })}
        onAlreadySetUp={() => void navigate({ to: '/login', search: {}, replace: true })}
      />
    </AuthLayout>
  )
}

export const setupRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/setup',
  component: SetupPage,
})

function RegisterPage() {
  const navigate = useNavigate()
  const { invite } = registerRoute.useSearch()
  const status = useAuthStatus()
  const closed = status.data !== undefined && !status.data.registration_open && !invite
  return (
    <AuthLayout
      title="Create your account"
      description={
        invite ? 'You have been invited to Xpenses.' : 'Your data is private to you on this instance.'
      }
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" search={{}} className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {closed ? (
        <p className="text-muted-foreground text-sm" role="status">
          Registration is closed. Ask the administrator for an invite link.
        </p>
      ) : (
        <RegisterForm inviteToken={invite} onSuccess={() => void navigate({ to: '/', replace: true })} />
      )}
    </AuthLayout>
  )
}

export const registerRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/register',
  validateSearch: parseRegisterSearch,
  component: RegisterPage,
})

function ResetPasswordPage() {
  const navigate = useNavigate()
  const { token } = resetPasswordRoute.useSearch()
  return (
    <AuthLayout
      title="Choose a new password"
      description={
        token
          ? 'This link came from your administrator. It works once.'
          : 'This reset link is incomplete. Ask your administrator for a new one.'
      }
      footer={
        <Link to="/login" search={{}} className="text-primary font-medium hover:underline">
          Back to sign in
        </Link>
      }
    >
      {token && (
        <ResetPasswordForm
          token={token}
          onSuccess={() => {
            toast.success('Password changed', { description: 'Sign in with your new password.' })
            void navigate({ to: '/login', search: {}, replace: true })
          }}
        />
      )}
    </AuthLayout>
  )
}

export const resetPasswordRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/reset-password',
  validateSearch: parseResetSearch,
  component: ResetPasswordPage,
})
