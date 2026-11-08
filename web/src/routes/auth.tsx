import { Link, Outlet, createRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { ForgotPasswordDialog } from '@/components/auth/ForgotPasswordDialog'
import { LoginForm } from '@/components/auth/LoginForm'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import { SetupForm } from '@/components/auth/SetupForm'
import { parseLoginSearch, parseRegisterSearch, parseResetSearch, safeRedirect, useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { formatShortDate } from '@/lib/dates'
import { errorMessage } from '@/lib/api'
import { performLogout, useAuthStatus } from '@/lib/queries/auth'
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
        invite ? 'You have been invited to Xpenses. Your first year is free.' : 'Your first year is free, and your data is private to you on this instance.'
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

/** Shown to a signed-in user whose free year has ended. */
function ExpiredPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  return (
    <AuthLayout
      title="Your free year has ended"
      description={
        user?.access_until
          ? `Your access to Xpenses ran out on ${formatShortDate(user.access_until)}.`
          : 'Your access to Xpenses has run out.'
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted-foreground">
          Everything you recorded is safe. To keep using the app, ask the administrator of this Xpenses
          instance to extend your access; the moment they do, sign in again and carry on where you left
          off.
        </p>
        {user && <p className="text-muted-foreground">Signed in as {user.email}.</p>}
        <Button
          variant="outline"
          className="self-start"
          onClick={() =>
            void performLogout()
              .then(() => navigate({ to: '/', replace: true }))
              .catch((e: unknown) => toast.error(errorMessage(e, 'Could not log out')))
          }
        >
          Log out
        </Button>
      </div>
    </AuthLayout>
  )
}

export const expiredRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/expired',
  component: ExpiredPage,
})
