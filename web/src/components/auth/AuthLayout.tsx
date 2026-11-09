import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Logo } from '@/components/layout/Brand'

/** What Xpenses offers, shown beside the sign-in form. */
export const POINTS = [
  'Free for your first year',
  'Reads screenshots from every bank in Bhutan',
  'Every expense in seconds, even offline',
  'Budgets that follow your own categories',
  'Your data stays yours, on your own server',
]

/** A few lines of a book, drawn on the ink panel. */
const VIGNETTE: { date: string; what: string; amount: string }[] = [
  { date: '07 Nov', what: 'Groceries', amount: '1,240.00' },
  { date: '08 Nov', what: 'Fuel', amount: '900.00' },
  { date: '09 Nov', what: 'Household · Rent', amount: '2,500.00' },
]

/**
 * The signed-out frame. Wide screens: an ink panel with the mark, a line about
 * Xpenses and a page of the book, beside the form on paper. Phones: a compact
 * ink bar, then the form.
 */
export function AuthLayout({
  title,
  eyebrow,
  description,
  children,
  footer,
}: {
  title: string
  eyebrow?: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="bg-background grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="bg-ink text-ink-foreground hidden flex-col p-10 lg:flex xl:p-14">
        <Link to="/" aria-label="Xpenses home" className="self-start">
          <Logo inverted />
        </Link>

        <div className="my-auto max-w-md py-12">
          <p className="font-display text-[2.5rem] leading-[1.08] font-medium">
            The expense book that fits in your pocket.
          </p>

          <div className="border-ink-foreground/15 mt-10 rounded-lg border" aria-hidden="true">
            <div className="border-ink-foreground/15 text-ink-muted flex justify-between border-b px-4 py-2.5 font-mono text-[0.625rem] tracking-[0.08em] uppercase">
              <span>November</span>
              <span>Nu.</span>
            </div>
            {VIGNETTE.map((r, i) => (
              <div
                key={r.date}
                className="border-ink-foreground/10 flex items-baseline gap-4 border-b px-4 py-2.5 text-[0.8125rem]"
              >
                <span className="text-ink-muted font-mono text-[0.6875rem]">{r.date}</span>
                <span className="flex-1">{r.what}</span>
                <span className="tabular">{r.amount}</span>
                {i === VIGNETTE.length - 1 && (
                  <span className="bg-saffron size-1.5 self-center rounded-full" />
                )}
              </div>
            ))}
            <div className="flex items-baseline justify-between px-4 pt-3 pb-3.5">
              <span className="text-ink-muted font-mono text-[0.625rem] tracking-[0.08em] uppercase">
                Spent
              </span>
              <span className="figure border-ink-foreground border-b-[3px] border-double text-xl">
                Nu. 4,640.00
              </span>
            </div>
          </div>

          <ul className="mt-10 grid gap-2.5 text-[0.875rem]">
            {POINTS.map((point, i) => (
              <li key={point} className="text-ink-foreground/80 flex items-baseline gap-3">
                <span className="text-saffron font-mono text-[0.6875rem]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-ink-muted font-mono text-[0.6875rem] tracking-[0.08em] uppercase">
          Made in Bhutan
        </p>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="bg-ink text-ink-foreground lg:hidden">
          <div className="flex h-14 items-center justify-between px-4 sm:px-6">
            <Link to="/" aria-label="Xpenses home">
              <Logo inverted />
            </Link>
          </div>
        </header>
        <div className="hidden justify-end px-10 pt-8 lg:flex">
          <Link
            to="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="size-4" /> Home
          </Link>
        </div>
        <main className="flex flex-1 flex-col items-center px-4 pt-8 pb-16 sm:px-6 sm:pt-14 lg:justify-center lg:pt-0 lg:pb-24">
          <div className="w-full max-w-[26rem]">
            {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
            <h1 className="font-display text-[2.25rem] leading-[1.05] font-medium sm:text-[2.75rem]">
              {title}
            </h1>
            {description && (
              <p className="text-muted-foreground mt-3 text-[0.9375rem] leading-relaxed">{description}</p>
            )}
            <div className="mt-8">{children}</div>
            {footer && <div className="text-muted-foreground mt-8 border-t pt-5 text-sm">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  )
}
