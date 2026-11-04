import type { ReactNode } from 'react'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

/** Minimal centred frame for /login, /setup and /register: no sidebar, no nav. */
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
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md">
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </span>
          <span className="font-heading text-base font-semibold tracking-tight">Xpensiv</span>
        </div>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="bg-card ring-foreground/10 w-full max-w-sm rounded-2xl p-6 ring-1 sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="text-muted-foreground mt-6 text-center text-sm">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
