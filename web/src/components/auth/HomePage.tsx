import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  CloudOff,
  FileDown,
  PieChart,
  ScanLine,
  Share2,
  ShieldCheck,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Logo } from '@/components/layout/Brand'
import { Button } from '@/components/ui/button'
import { useAuthStatus } from '@/lib/queries/auth'

const BANKS = ['Bank of Bhutan · mBoB & mPay', 'BNB', 'Druk PNB', 'BDBL', 'T Bank', 'DK Bank']

const STEPS: { title: string; body: string }[] = [
  { title: 'Pay as usual', body: 'Send money from mBoB, mPay, BNB, Druk PNB or any banking app in Bhutan.' },
  { title: 'Share the screenshot', body: 'Share the success screen into Xpenses, or pick it from your gallery.' },
  { title: 'Check and save', body: 'Amount, date and reference are already filled in. Choose a category and save.' },
]

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: ScanLine, title: 'Reads your bank screens', body: 'No retyping amounts. The reference number is kept and searchable.' },
  { icon: Target, title: 'Budgets that warn you', body: 'A monthly limit per category, and a clear note the moment one is crossed.' },
  { icon: PieChart, title: 'See where the month went', body: 'Spending by category, day and account, for any week, month or range.' },
  { icon: Wallet, title: 'Every account in one place', body: 'Bank accounts, cash, wallets and cards, with balances that add up.' },
  { icon: CloudOff, title: 'Works offline', body: 'Record expenses with no signal; they sync when you are back online.' },
  { icon: FileDown, title: 'Yours to export', body: 'CSV and PDF reports any time, and encrypted backups.' },
]

/** The public home page: what Xpenses is, and the way in. Signed-in users see the dashboard here instead. */
export function HomePage() {
  const status = useAuthStatus()
  const registrationOpen = status.data?.registration_open ?? false
  const primary = registrationOpen
    ? { to: '/register' as const, label: 'Start your free year' }
    : { to: '/login' as const, label: 'Sign in' }

  return (
    <div className="bg-background min-h-svh">
      <header className="bg-background/85 sticky top-0 z-20 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
          <nav className="flex items-center gap-2">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <a href="#how">How it works</a>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/login" search={{}}>
                Sign in
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden="true" className="absolute -top-40 -right-32 size-[34rem] rounded-full bg-[oklch(0.6_0.2_277/0.12)] blur-3xl" />
          <div aria-hidden="true" className="absolute -bottom-40 -left-32 size-[28rem] rounded-full bg-[oklch(0.65_0.13_200/0.14)] blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pt-14 pb-16 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20 lg:pb-24">
            <div>
              <p className="bg-accent text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
                <ShieldCheck className="size-3.5" /> Free for your first year
              </p>
              <h1 className="mt-5 text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Every ngultrum, <span className="text-primary">accounted for.</span>
              </h1>
              <p className="text-foreground/80 mt-5 max-w-xl text-lg">
                Share a payment screenshot from any bank in Bhutan and Xpenses fills in the expense for you. Budgets,
                reports and every account in one place, even offline.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" className="h-12 rounded-xl px-6 text-base" asChild>
                  <Link to={primary.to} search={{}}>
                    {primary.label} <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
                {registrationOpen && (
                  <Button size="lg" variant="ghost" className="h-12 rounded-xl px-5 text-base" asChild>
                    <Link to="/login" search={{}}>
                      I have an account
                    </Link>
                  </Button>
                )}
              </div>
              {!registrationOpen && status.data && (
                <p className="text-muted-foreground mt-3 text-sm">New here? Ask the administrator for an invite link.</p>
              )}
            </div>
            <ReceiptMock />
          </div>
        </section>

        {/* Banks */}
        <section aria-labelledby="banks-heading" className="border-y bg-card/60">
          <div className="mx-auto max-w-6xl px-5 py-8">
            <h2 id="banks-heading" className="text-muted-foreground text-center text-sm font-medium">
              Works with every bank in Bhutan
            </h2>
            <ul className="mt-4 flex flex-wrap justify-center gap-2">
              {BANKS.map((b) => (
                <li key={b} className="bg-background rounded-full border px-4 py-1.5 text-sm font-medium">
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how" aria-labelledby="how-heading" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 lg:py-20">
          <h2 id="how-heading" className="text-3xl font-semibold tracking-tight">
            Record an expense in three taps
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="bg-card rounded-[1.25rem] border p-5">
                <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full text-sm font-semibold">
                  {i + 1}
                </span>
                <p className="mt-4 font-semibold">{s.title}</p>
                <p className="text-muted-foreground mt-1 text-sm">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section aria-labelledby="features-heading" className="bg-card/60 border-y">
          <div className="mx-auto max-w-6xl px-5 py-16 lg:py-20">
            <h2 id="features-heading" className="text-3xl font-semibold tracking-tight">
              Everything a household budget needs
            </h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="bg-background rounded-[1.25rem] border p-5">
                  <span className="bg-accent text-primary flex size-10 items-center justify-center rounded-xl">
                    <Icon className="size-5" />
                  </span>
                  <p className="mt-4 font-semibold">{title}</p>
                  <p className="text-muted-foreground mt-1 text-sm">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Closing call */}
        <section className="mx-auto max-w-6xl px-5 py-16 lg:py-20">
          <div className="relative overflow-hidden rounded-[1.75rem] bg-[oklch(0.25_0.06_277)] px-6 py-12 text-center text-white sm:px-12">
            <div aria-hidden="true" className="absolute -top-24 -right-24 size-80 rounded-full bg-[oklch(0.5_0.2_277/0.45)] blur-3xl" />
            <h2 className="relative text-3xl font-semibold tracking-tight">Your first year is on us</h2>
            <p className="relative mx-auto mt-3 max-w-lg text-white/75">
              Install it on your phone from the browser, share your next payment into it, and see the month take shape.
            </p>
            <ul className="relative mx-auto mt-6 flex max-w-xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/85">
              {['No card needed', 'Your data stays private', 'Installs like an app'].map((p) => (
                <li key={p} className="flex items-center gap-1.5">
                  <Check className="size-4" /> {p}
                </li>
              ))}
            </ul>
            <Button size="lg" variant="secondary" className="relative mt-8 h-12 rounded-xl px-6 text-base" asChild>
              <Link to={primary.to} search={{}}>
                {primary.label} <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs">
          <Logo />
          <p>Made in Bhutan.</p>
        </div>
      </footer>
    </div>
  )
}

/** A drawn phone showing a shared bank screen turning into a filled-in expense. */
function ReceiptMock() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-sm">
      <div className="bg-card rounded-[2rem] border p-5 shadow-xl shadow-[oklch(0.4_0.2_277/0.12)]">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Share2 className="text-primary size-4" /> Shared from BNB
        </div>
        <div className="bg-muted/50 mt-3 rounded-xl border p-3 text-xs">
          <p className="text-income font-semibold">Fund Transfer Successful</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">Nu. 2,500.00</p>
          <p className="text-muted-foreground mt-1">Ref BNB2611090001 · 09 Nov 2026</p>
        </div>
        <div className="text-muted-foreground my-3 flex items-center justify-center gap-1.5 text-xs">
          <ScanLine className="size-3.5" /> Read automatically
        </div>
        <div className="space-y-2 text-sm">
          {[
            ['Amount', 'Nu. 2,500'],
            ['Date', '9 Nov 2026'],
            ['Category', 'Household · Rent'],
            ['Account', 'BNB savings'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between rounded-xl border px-3 py-2">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
        </div>
        <div className="bg-primary text-primary-foreground mt-4 rounded-xl py-2.5 text-center text-sm font-semibold">Save</div>
      </div>
    </div>
  )
}
