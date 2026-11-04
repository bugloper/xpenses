import { Link, Outlet, createRoute, useNavigate } from '@tanstack/react-router'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { LoginForm } from '@/components/auth/LoginForm'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { SetupForm } from '@/components/auth/SetupForm'
import { parseLoginSearch, parseRegisterSearch, safeRedirect } from '@/lib/auth'
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
      />
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
      title="Set up Xpensiv"
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
        invite ? 'You have been invited to Xpensiv.' : 'Your data is private to you on this instance.'
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
