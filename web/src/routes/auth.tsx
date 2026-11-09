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
      eyebrow="Welcome back"
      description="Enter your email and password."
      footer={
        registrationOpen ? (
          <>
            New here?{' '}
            <Link
              to="/register"
              search={{}}
              className="text-foreground decoration-saffron font-medium underline underline-offset-4"
            >
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
      eyebrow="First run"
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
      eyebrow={invite ? 'Invitation' : 'Free for your first year'}
      description={
        invite
          ? 'You have been invited to Xpenses. Your first year is free.'
          : 'Your first year is free, and your data is private to you on this instance.'
      }
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            search={{}}
            className="text-foreground decoration-saffron font-medium underline underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      {closed ? (
        <p
          className="bg-card border-l-saffron rounded-md border border-l-[3px] px-4 py-3.5 text-sm"
          role="status"
        >
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
      eyebrow="Password reset"
      description={
        token
          ? 'This link came from your administrator. It works once.'
          : 'This reset link is incomplete. Ask your administrator for a new one.'
      }
      footer={
        <Link
          to="/login"
          search={{}}
          className="text-foreground decoration-saffron font-medium underline underline-offset-4"
        >
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
      eyebrow="Access paused"
      description={
        user?.access_until
          ? `Your access to Xpenses ran out on ${formatShortDate(user.access_until)}. Nothing you recorded has been deleted.`
          : 'Your access to Xpenses has run out. Nothing you recorded has been deleted.'
      }
    >
      <div className="flex flex-col gap-6 text-sm">
        <dl className="bg-card divide-rule divide-y rounded-lg border px-4">
          {user && (
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="eyebrow">Signed in as</dt>
              <dd className="min-w-0 truncate font-medium">{user.email}</dd>
            </div>
          )}
          {user?.access_until && (
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="eyebrow">Access ended</dt>
              <dd className="font-medium">{formatShortDate(user.access_until)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-4 py-3">
            <dt className="eyebrow">Your records</dt>
            <dd className="font-medium">Kept safe</dd>
          </div>
        </dl>
        <div>
          <h2 className="eyebrow text-foreground/80">What to do</h2>
          <ol className="border-foreground mt-3 border-t-2">
            {[
              'Ask the administrator of this Xpenses instance to extend your access.',
              'The moment they do, sign in again and carry on where you left off.',
            ].map((step, i) => (
              <li key={step} className="border-rule flex gap-4 border-b py-3.5">
                <span className="figure text-saffron w-4 shrink-0 text-xl leading-none">{i + 1}</span>
                <span className="text-foreground/85">{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <Button
          size="lg"
          className="h-12 w-full"
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
