import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { Logo } from '@/components/layout/Brand'

const POINTS = [
  'Every expense in seconds, even offline',
  'Budgets that follow your own categories',
  'Your data stays yours, on your own server',
]

/** The signed-out frame: a word about Xpenses beside the form on a wide screen, just the form on a phone. */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-[oklch(0.25_0.06_277)] p-10 text-white lg:flex lg:flex-col">
        <div aria-hidden="true" className="absolute -top-40 -right-40 size-[32rem] rounded-full bg-[oklch(0.5_0.2_277/0.45)] blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-48 -left-24 size-[28rem] rounded-full bg-[oklch(0.55_0.13_200/0.25)] blur-3xl" />
        <Logo className="relative [&_.text-muted-foreground]:text-white/60" />
        <div className="relative mt-auto max-w-md">
          <p className="text-3xl leading-tight font-semibold tracking-tight">The expense book that fits in your pocket.</p>
          <ul className="mt-8 grid gap-3 text-white/80">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <Check className="size-3" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-white/70">Made in Bhutan.</p>
      </aside>
      <div className="flex flex-col">
        <header className="flex h-16 items-center px-5 lg:hidden">
          <Logo />
        </header>
        <main className="flex flex-1 flex-col items-center px-5 pt-6 pb-16 lg:justify-center lg:pt-16">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="text-muted-foreground mt-1.5 text-sm">{description}</p>}
            <div className="mt-6">{children}</div>
            {footer && <div className="text-muted-foreground mt-6 text-center text-sm">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  )
}
