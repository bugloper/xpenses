import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { Logo } from '@/components/layout/Brand'
import { Button } from '@/components/ui/button'
import { useAuthStatus } from '@/lib/queries/auth'
import { POINTS } from './AuthLayout'

/** The public home page: what Xpenses is, and the way in. Signed-in users see the dashboard here instead. */
export function HomePage() {
  const status = useAuthStatus()
  const registrationOpen = status.data?.registration_open ?? false
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
        <Logo />
        <Button variant="outline" asChild>
          <Link to="/login" search={{}}>
            Sign in
          </Link>
        </Button>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 px-5 py-12 lg:flex-row lg:items-center lg:gap-16">
        <div className="max-w-xl">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            The expense book that fits in your pocket.
          </h1>
          <p className="text-muted-foreground mt-4 text-lg">
            Record every expense in seconds, share a payment screenshot from mBoB or mPay and let Xpenses read it,
            set budgets on your own categories and see where the month went.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" className="h-11 rounded-xl px-6" asChild>
              <Link to="/login" search={{}}>
                Sign in
              </Link>
            </Button>
            {registrationOpen && (
              <Button size="lg" variant="outline" className="h-11 rounded-xl px-6" asChild>
                <Link to="/register" search={{}}>
                  Create an account
                </Link>
              </Button>
            )}
          </div>
          {!registrationOpen && status.data && (
            <p className="text-muted-foreground mt-3 text-sm">New here? Ask the administrator for an invite link.</p>
          )}
        </div>
        <ul className="bg-card grid gap-3 rounded-[1.25rem] border p-6 lg:w-80">
          {POINTS.map((point) => (
            <li key={point} className="flex items-start gap-3 text-sm">
              <span className="bg-accent text-primary mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full">
                <Check className="size-3" />
              </span>
              {point}
            </li>
          ))}
        </ul>
      </main>
      <footer className="text-muted-foreground mx-auto w-full max-w-5xl px-5 py-6 text-xs">Made in Bhutan.</footer>
    </div>
  )
}
