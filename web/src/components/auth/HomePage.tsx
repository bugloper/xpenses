import { Link } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowRight,
  Check,
  CloudOff,
  FileDown,
  PieChart,
  ScanLine,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Logo } from '@/components/layout/Brand'
import { Button } from '@/components/ui/button'
import { usePublicTestimonials } from '@/lib/queries/community'
import { useAuthStatus } from '@/lib/queries/auth'
import { formatMonthLabel } from '@/lib/dates'
import { cn } from '@/lib/utils'

/** The banks whose success screens Xpenses reads, as they are known at the counter. */
const BANKS: { name: string; note: string }[] = [
  { name: 'mBoB', note: 'Bank of Bhutan' },
  { name: 'mPay', note: 'Bank of Bhutan' },
  { name: 'BNB', note: 'Bhutan National Bank' },
  { name: 'Druk PNB', note: 'Druk PNB Bank' },
  { name: 'BDBL', note: 'Bhutan Development Bank' },
  { name: 'T Bank', note: 'T Bank Ltd' },
  { name: 'DK Bank', note: 'DK Bank Ltd' },
]

const STEPS: { title: string; body: string }[] = [
  { title: 'Pay as usual', body: 'Send money from mBoB, mPay, BNB, Druk PNB or any banking app in Bhutan.' },
  {
    title: 'Share the screenshot',
    body: 'Share the success screen into Xpenses, or pick it from your gallery.',
  },
  {
    title: 'Check and save',
    body: 'Amount, date and reference are already filled in. Choose a category and save.',
  },
]

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ScanLine,
    title: 'Reads your bank screens',
    body: 'No retyping amounts. The reference number is kept and searchable.',
  },
  {
    icon: Target,
    title: 'Budgets that warn you',
    body: 'A monthly limit per category, and a clear note the moment one is crossed.',
  },
  {
    icon: PieChart,
    title: 'See where the month went',
    body: 'Spending by category, day and account, for any week, month or range.',
  },
  {
    icon: Wallet,
    title: 'Every account in one place',
    body: 'Bank accounts, cash, wallets and cards, with balances that add up.',
  },
  {
    icon: CloudOff,
    title: 'Works offline',
    body: 'Record expenses with no signal; they sync when you are back online.',
  },
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
      <Masthead registrationOpen={registrationOpen} />

      <main>
        {/* Hero: the claim, then the worked example as a plate. */}
        <section aria-labelledby="hero-heading" className="border-b">
          <div className="mx-auto max-w-7xl px-4 pt-10 pb-12 sm:px-8 lg:pt-16 lg:pb-16">
            <div className="grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-10">
              <div className="lg:col-span-7">
                <p className="eyebrow flex items-center gap-2">
                  <span aria-hidden className="bg-saffron inline-block size-1.5 rounded-full" />
                  An expense book for Bhutan
                </p>
                <h1
                  id="hero-heading"
                  className="font-display mt-5 text-[2.75rem] leading-[1.02] font-medium sm:text-6xl lg:text-[5.25rem]"
                >
                  Every ngultrum,{' '}
                  <span className="decoration-saffron underline decoration-double decoration-[3px] underline-offset-[0.18em]">
                    accounted for.
                  </span>
                </h1>
              </div>
              <div className="lg:col-span-5 lg:pb-2">
                <p className="text-foreground/80 max-w-md text-[1.0625rem] leading-relaxed">
                  Share a payment screenshot from any bank in Bhutan and Xpenses fills in the expense for you.
                  Budgets, reports and every account in one place, even offline.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button size="xl" variant={registrationOpen ? 'saffron' : 'default'} asChild>
                    <Link to={primary.to} search={{}}>
                      {primary.label} <ArrowRight data-icon="inline-end" />
                    </Link>
                  </Button>
                  {registrationOpen && (
                    <Button size="xl" variant="outline" className="font-medium" asChild>
                      <Link to="/login" search={{}}>
                        I have an account
                      </Link>
                    </Button>
                  )}
                </div>
                {!registrationOpen && status.data && (
                  <p className="text-muted-foreground mt-3 text-sm">
                    New here? Ask the administrator for an invite link.
                  </p>
                )}
              </div>
            </div>

            <WorkedExample />
          </div>
        </section>

        {/* The banks, set as a line of type. */}
        <section aria-labelledby="banks-heading" className="bg-card border-b">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8 lg:py-12">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 id="banks-heading" className="eyebrow text-foreground/80">
                Reads success screens from
              </h2>
              <p className="text-muted-foreground text-sm">
                …and any other app that shows a successful payment in ngultrum.
              </p>
            </div>
            <ul className="mt-4 grid grid-cols-2 border-t sm:grid-cols-4 lg:grid-cols-7">
              {BANKS.map((b) => (
                <li
                  key={b.name}
                  className="border-rule border-b py-4 pr-3 lg:border-b-0 lg:not-first:border-l lg:not-first:pl-5"
                >
                  <span className="font-display block text-[1.625rem] leading-tight font-medium whitespace-nowrap lg:text-[1.875rem]">
                    {b.name}
                  </span>
                  <span className="eyebrow mt-1 block text-[0.625rem]">{b.note}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works: three entries in the book. */}
        <section id="how" aria-labelledby="how-heading" className="scroll-mt-20 border-b">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-8 lg:py-20">
            <SectionHead eyebrow="How it works" id="how-heading">
              Record an expense in three taps
            </SectionHead>
            <ol className="border-foreground mt-10 grid border-t-2 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className="border-rule flex gap-5 border-b py-6 md:flex-col md:gap-6 md:border-b-0 md:py-8 md:pr-8 md:not-first:border-l md:not-first:pl-8"
                >
                  <span className="figure text-saffron w-10 shrink-0 text-5xl leading-none md:text-7xl">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-2xl font-medium">{s.title}</h3>
                    <p className="text-muted-foreground mt-2 max-w-xs text-[0.9375rem] leading-relaxed">
                      {s.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features in a ruled grid. */}
        <section aria-labelledby="features-heading" className="bg-card border-b">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-8 lg:py-20">
            <SectionHead eyebrow="What it does" id="features-heading">
              Everything a household budget needs
            </SectionHead>
            <ul className="bg-border mt-10 grid gap-px overflow-hidden rounded-lg border sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="bg-card flex flex-col gap-3 p-5 sm:gap-4 sm:p-6 lg:p-8">
                  <div className="flex items-center justify-between">
                    <span className="bg-accent text-accent-foreground flex size-9 items-center justify-center rounded-md">
                      <Icon className="size-[1.125rem]" strokeWidth={1.75} />
                    </span>
                    <span className="eyebrow">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <div>
                    <h3 className="font-display text-[1.375rem] leading-snug font-medium">{title}</h3>
                    <p className="text-muted-foreground mt-1.5 text-[0.9375rem] leading-relaxed">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Testimonials />

        {/* The free year, as a statement. */}
        <section aria-labelledby="year-heading" className="border-b">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-8 lg:grid-cols-12 lg:py-20">
            <div className="lg:col-span-6">
              <SectionHead eyebrow="The free year" id="year-heading">
                Your first year is on us
              </SectionHead>
              <p className="text-muted-foreground mt-4 max-w-md text-[1.0625rem] leading-relaxed">
                Every account can use Xpenses free for a year from the day it is created. Install it on your
                phone from the browser, share your next payment into it, and see the month take shape.
              </p>
            </div>
            <div className="lg:col-span-5 lg:col-start-8">
              <div className="bg-card rounded-lg border">
                <div className="flex items-center justify-between border-b px-5 py-3">
                  <span className="eyebrow">Statement</span>
                  <span className="eyebrow">Xpenses</span>
                </div>
                <dl className="divide-rule divide-y px-5">
                  <StatementLine label="First year" value="Free" />
                  <StatementLine label="Card needed" value="No" />
                  <StatementLine label="Your data" value="Private to you" />
                  <StatementLine label="Installs like an app" value="Phone & desktop" />
                </dl>
                <div className="flex items-baseline justify-between border-t px-5 pt-3 pb-4">
                  <span className="eyebrow text-foreground/80">Due today</span>
                  <span className="figure border-foreground border-b-[3px] border-double pb-0.5 text-3xl">
                    Nu. 0.00
                  </span>
                </div>
              </div>
              <p className="text-muted-foreground mt-3 text-[0.8125rem]">
                When the year is up your records stay safe, and the administrator can extend your access.
              </p>
            </div>
          </div>
        </section>

        {/* Closing call. */}
        <section aria-labelledby="close-heading" className="bg-ink text-ink-foreground">
          <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-14 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:py-20">
            <div>
              <p className="eyebrow text-ink-muted">Start with your next payment</p>
              <h2
                id="close-heading"
                className="font-display mt-3 max-w-2xl text-4xl leading-[1.05] font-medium sm:text-5xl"
              >
                Keep the book. Skip the typing.
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="xl" variant="saffron" asChild>
                <Link to={primary.to} search={{}}>
                  {primary.label} <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
              {registrationOpen && (
                <Button
                  size="xl"
                  variant="ghost"
                  className="text-ink-foreground hover:bg-ink-foreground/10 hover:text-ink-foreground font-medium"
                  asChild
                >
                  <Link to="/login" search={{}}>
                    I have an account
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-8">
          <Logo />
          <nav aria-label="Footer" className="text-muted-foreground flex items-center gap-5 text-sm">
            <a href="#how" className="hover:text-foreground">
              How it works
            </a>
            <Link to="/login" search={{}} className="hover:text-foreground">
              Sign in
            </Link>
            <span className="eyebrow">Made in Bhutan</span>
          </nav>
        </div>
      </footer>
    </div>
  )
}

/** The ink bar across the top, as in the app itself. */
function Masthead({ registrationOpen }: { registrationOpen: boolean }) {
  return (
    <header className="bg-ink text-ink-foreground sticky top-0 z-20">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-8">
        <Link to="/" aria-label="Xpenses home" className="shrink-0">
          <Logo inverted />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <a
            href="#how"
            className="text-ink-muted hover:text-ink-foreground hidden h-9 items-center px-3 text-[0.8125rem] font-medium tracking-wide transition-colors md:inline-flex"
          >
            How it works
          </a>
          <Link
            to="/login"
            search={{}}
            className="text-ink-foreground hover:bg-ink-foreground/10 inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors"
          >
            Sign in
          </Link>
          {registrationOpen && (
            <Link
              to="/register"
              search={{}}
              className="bg-ink-foreground text-ink hidden h-9 items-center rounded-md px-3.5 text-sm font-semibold transition-opacity hover:opacity-90 sm:inline-flex"
            >
              Create an account
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}

/**
 * What people who use Xpenses say, in their own words: only what the
 * administrator has read and approved. Not shown at all until there is some.
 */
function Testimonials() {
  const { data } = usePublicTestimonials()
  if (!data || data.length === 0) return null
  return (
    <section aria-labelledby="words-heading" className="border-b">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-8 lg:py-20">
        <SectionHead eyebrow="In their words" id="words-heading">
          From people keeping their book
        </SectionHead>
        <div className="mt-10 columns-1 gap-4 md:columns-2 lg:columns-3">
          {data.map((t) => (
            <figure key={t.id} className="bg-card mb-4 break-inside-avoid rounded-lg border p-6">
              <span aria-hidden className="font-display text-saffron block text-5xl leading-none">
                “
              </span>
              <blockquote className="font-display -mt-2 text-xl leading-snug text-pretty">
                {t.body}
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t pt-4">
                <span
                  aria-hidden
                  className="bg-saffron text-saffron-foreground flex size-9 shrink-0 items-center justify-center rounded-md font-mono text-xs font-semibold"
                >
                  {t.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{t.name}</span>
                  {t.since && (
                    <span className="eyebrow block truncate">
                      Using Xpenses since {formatMonthLabel(t.since)}
                    </span>
                  )}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

function SectionHead({ eyebrow, id, children }: { eyebrow: string; id: string; children: ReactNode }) {
  return (
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h2
        id={id}
        className="font-display mt-3 max-w-2xl text-[2.25rem] leading-[1.08] font-medium sm:text-5xl"
      >
        {children}
      </h2>
    </div>
  )
}

function StatementLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 text-[0.9375rem]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

/**
 * Fig. 1: a bank's success screen, the fields read off it, and the line it
 * becomes in the book. Drawn in HTML so it follows the theme.
 */
function WorkedExample() {
  return (
    <figure className="mt-12 lg:mt-16">
      <div
        aria-hidden="true"
        className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,0.9fr)_auto_minmax(0,1fr)_auto_minmax(0,1.5fr)] lg:gap-0"
      >
        <BankScreen />
        <Connector />
        <ReadOff />
        <Connector />
        <LedgerPage />
      </div>
      <figcaption className="eyebrow mt-4 flex flex-wrap gap-x-3">
        <span className="text-foreground/80">Fig. 1</span>
        <span>A BNB transfer, shared into Xpenses and entered in the book.</span>
      </figcaption>
    </figure>
  )
}

function Plate({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('bg-card flex flex-col rounded-lg border', className)}>
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="eyebrow">{label}</span>
      </div>
      <div className="flex flex-1 flex-col p-4">{children}</div>
    </div>
  )
}

function BankScreen() {
  return (
    <Plate label="1 · The bank's screen">
      <div className="bg-muted/70 mx-auto flex w-full max-w-[15rem] flex-1 flex-col rounded-md border px-4 py-5 text-center">
        <span className="bg-income/15 text-income mx-auto flex size-9 items-center justify-center rounded-full">
          <Check className="size-5" strokeWidth={2.5} />
        </span>
        <p className="text-income mt-3 text-[0.8125rem] font-semibold">Fund Transfer Successful</p>
        <p className="figure mt-2 text-[1.75rem] leading-none whitespace-nowrap">Nu. 2,500.00</p>
        <div className="text-muted-foreground mt-4 space-y-1 text-left text-[0.75rem]">
          <p className="flex justify-between gap-2">
            <span>Ref</span>
            <span className="text-foreground font-mono">BNB2611090001</span>
          </p>
          <p className="flex justify-between gap-2">
            <span>Date</span>
            <span className="text-foreground font-mono">09/11/2026 10:42</span>
          </p>
          <p className="flex justify-between gap-2">
            <span>Remarks</span>
            <span className="text-foreground">November rent</span>
          </p>
        </div>
      </div>
    </Plate>
  )
}

function ReadOff() {
  const fields: [string, string][] = [
    ['Amount', 'Nu. 2,500.00'],
    ['Reference', 'BNB2611090001'],
    ['Date', '9 Nov 2026'],
    ['Time', '10:42'],
    ['Remarks', 'November rent'],
  ]
  return (
    <Plate label="2 · Read off it">
      <dl className="divide-rule flex flex-1 flex-col justify-center divide-y">
        {fields.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="eyebrow">{k}</dt>
            <dd className={cn('text-[0.8125rem] font-medium', k === 'Reference' && 'font-mono text-xs')}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </Plate>
  )
}

function LedgerPage() {
  const rows: { date: string; what: string; ref: string; amount: string; fresh?: boolean }[] = [
    { date: '07 Nov', what: 'Groceries · Centenary Market', ref: 'MBOB1107', amount: '1,240.00' },
    { date: '08 Nov', what: 'Fuel', ref: 'MPAY0812', amount: '900.00' },
    { date: '09 Nov', what: 'Household · Rent', ref: 'BNB2611090001', amount: '2,500.00', fresh: true },
  ]
  return (
    <Plate label="3 · In your book">
      <div className="flex flex-1 flex-col">
        <div className="eyebrow grid grid-cols-[3.25rem_minmax(0,1fr)_auto] gap-3 border-b pb-2 text-[0.625rem]">
          <span>Date</span>
          <span>Particulars</span>
          <span className="text-right">Nu.</span>
        </div>
        {rows.map((r) => (
          <div
            key={r.ref}
            className={cn(
              'border-rule relative grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-baseline gap-3 border-b py-2.5 text-[0.8125rem]',
              r.fresh ? 'bg-saffron-soft/60 -mx-4 px-4' : 'text-muted-foreground',
            )}
          >
            {r.fresh && <span className="bg-saffron absolute inset-y-0 left-0 w-[3px]" />}
            <span className="font-mono text-xs">{r.date}</span>
            <span className="min-w-0">
              <span className={cn('block truncate', r.fresh && 'text-foreground font-medium')}>{r.what}</span>
              <span className="block truncate font-mono text-[0.6875rem]">{r.ref}</span>
            </span>
            <span className={cn('tabular text-right', r.fresh && 'text-foreground font-semibold')}>
              {r.amount}
            </span>
          </div>
        ))}
        <div className="mt-auto flex items-baseline justify-between pt-3">
          <span className="eyebrow">Spent this week</span>
          <span className="figure border-foreground border-b-[3px] border-double text-xl">Nu. 4,640.00</span>
        </div>
      </div>
    </Plate>
  )
}

function Connector({ className }: { className?: string }) {
  return (
    <div className={cn('text-muted-foreground flex items-center justify-center lg:px-2', className)}>
      <ArrowDown className="size-4 lg:hidden" />
      <ArrowRight className="hidden size-4 lg:block" />
    </div>
  )
}
