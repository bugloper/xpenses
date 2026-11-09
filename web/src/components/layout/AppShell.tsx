import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { ArrowLeft, Moon, Plus, Sun } from 'lucide-react'
import { LogoutDialog } from '@/components/auth/LogoutDialog'
import { MoreSheetUser, UserMenu } from '@/components/auth/UserBadge'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { AddTransactionSheet } from '@/components/transactions/AddTransactionSheet'
import { useAuth } from '@/lib/auth'
import { uiStore, useUIStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import { AccessBanner } from './AccessBanner'
import { Logo } from './Brand'
import { CurrencyMenu } from './CurrencyMenu'
import { MORE_NAV, PRIMARY_NAV, SETUP_NAV, TAB_NAV, visibleNav, type NavItem } from './nav'
import { PendingSheet } from './PendingSheet'
import { PwaInstallPrompt } from './PwaInstallPrompt'
import { PwaUpdatePrompt } from './PwaUpdatePrompt'
import { SyncPill } from './SyncPill'
import { useTheme } from './ThemeProvider'

function isActive(item: NavItem, pathname: string) {
  return item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + '/')
}

/** Where the phone's back arrow goes on a detail screen, and what that screen is called. */
function backFor(pathname: string): { title: string; back: string } | null {
  const [first = '', second] = pathname.split('/').filter(Boolean)
  if (first === 'transactions' && second) return { title: 'Transaction', back: '/transactions' }
  if (first === 'accounts' && second) return { title: 'Account', back: '/accounts' }
  if (first === 'add') return { title: 'Record a payment', back: '/' }
  return null
}

/** A square button on the ink bar. */
const inkButton =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-foreground/85 transition-colors hover:bg-ink-foreground/10 hover:text-ink-foreground'

function ThemeButton() {
  const { theme, toggle } = useTheme()
  return (
    <button type="button" onClick={toggle} aria-label="Toggle theme" className={inkButton}>
      {theme === 'dark' ? <Sun className="size-[1.125rem]" /> : <Moon className="size-[1.125rem]" />}
    </button>
  )
}

/** Desktop: one ink bar across the top — the mark, the screens as typeset tabs, then the tools. */
function Masthead() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const tab = (item: NavItem) => {
    const current = isActive(item, pathname)
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-current={current ? 'page' : undefined}
        className={cn(
          'relative flex h-full items-center px-3 text-[0.8125rem] font-medium tracking-wide transition-colors',
          current ? 'text-ink-foreground' : 'text-ink-muted hover:text-ink-foreground',
        )}
      >
        {item.label}
        <span
          aria-hidden
          className={cn(
            'bg-saffron absolute inset-x-3 bottom-0 h-[3px] rounded-t-sm transition-opacity',
            current ? 'opacity-100' : 'opacity-0',
          )}
        />
      </Link>
    )
  }
  return (
    <header className="bg-ink text-ink-foreground sticky top-0 z-30 hidden lg:block">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-8">
        <Link to="/" aria-label="Xpenses home" className="shrink-0">
          <Logo inverted />
        </Link>
        <nav aria-label="Main" className="flex h-full min-w-0 flex-1 items-stretch">
          {PRIMARY_NAV.map(tab)}
          <span aria-hidden className="bg-ink-foreground/15 mx-2 my-5 w-px" />
          {SETUP_NAV.map(tab)}
        </nav>
        <div className="flex shrink-0 items-center gap-1.5">
          <CurrencyMenu />
          <ThemeButton />
          <button
            type="button"
            onClick={() => uiStore.openAdd()}
            aria-label="Add transaction"
            className="bg-saffron text-saffron-foreground ml-1.5 inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-sm font-semibold transition-[filter] hover:brightness-95"
          >
            <Plus className="size-4" strokeWidth={2.75} /> Record
          </button>
          <span aria-hidden className="bg-ink-foreground/15 mx-1.5 h-6 w-px" />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}

/** Phone and tablet: a slim ink bar — the mark, or a back arrow on a detail screen. */
function Topbar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const back = backFor(pathname)
  return (
    <header className="bg-ink text-ink-foreground sticky top-0 z-30 lg:hidden">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
        {back ? (
          <>
            <Link to={back.back} aria-label="Back" className={inkButton}>
              <ArrowLeft className="size-5" />
            </Link>
            <span className="font-display min-w-0 flex-1 truncate text-lg">{back.title}</span>
          </>
        ) : (
          <Link to="/" aria-label="Xpenses home" className="min-w-0 flex-1">
            <Logo inverted />
          </Link>
        )}
        <CurrencyMenu />
        <ThemeButton />
      </div>
    </header>
  )
}

/** The phone's ink tab bar, with the saffron Record key in the middle. */
function Tabbar() {
  const { moreOpen } = useUIStore()
  const { isAdmin } = useAuth()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const moreActive = MORE_NAV.some((i) => isActive(i, pathname))
  const [home, ledger, budgets] = TAB_NAV as [NavItem, NavItem, NavItem]
  const cell =
    'relative flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium tracking-wide transition-colors'
  const marker = (on: boolean) => (
    <span
      aria-hidden
      className={cn('bg-saffron absolute top-0 h-[3px] w-8 rounded-b-sm', on ? 'opacity-100' : 'opacity-0')}
    />
  )
  const tab = (item: NavItem) => {
    const Icon = item.icon
    const current = isActive(item, pathname)
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-label={item.label}
        aria-current={current ? 'page' : undefined}
        className={cn(cell, current ? 'text-ink-foreground' : 'text-ink-muted')}
      >
        {marker(current)}
        <Icon className="size-[1.3rem]" strokeWidth={current ? 2.25 : 1.75} />
        {item.short ?? item.label}
      </Link>
    )
  }
  return (
    <>
      <nav aria-label="Main" className="safe-bottom bg-ink fixed inset-x-0 bottom-0 z-30 lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {tab(home)}
          {tab(ledger)}
          <div className="flex items-center justify-center">
            <button
              type="button"
              aria-label="Add transaction"
              onClick={() => uiStore.openAdd()}
              className="bg-saffron text-saffron-foreground ring-ink flex size-13 -translate-y-3 items-center justify-center rounded-lg shadow-[0_8px_20px_-6px_rgb(0_0_0/0.5)] ring-4 transition-transform active:scale-95"
            >
              <Plus className="size-6" strokeWidth={2.75} />
            </button>
          </div>
          {tab(budgets)}
          <button
            type="button"
            onClick={() => uiStore.setMore(true)}
            className={cn(cell, moreActive ? 'text-ink-foreground' : 'text-ink-muted')}
          >
            {marker(moreActive)}
            <MoreIcon />
            More
          </button>
        </div>
      </nav>
      <ResponsiveSheet open={moreOpen} onOpenChange={uiStore.setMore} title="More">
        <MoreSheetUser />
        <ul className="divide-y border-y">
          {visibleNav(MORE_NAV, isAdmin).map((item) => {
            const Icon = item.icon
            const current = isActive(item, pathname)
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={() => uiStore.setMore(false)}
                  className="hover:bg-muted/60 flex items-center gap-3 px-1 py-3.5 text-[0.9375rem] font-medium"
                >
                  <Icon className="text-muted-foreground size-[1.125rem]" />
                  <span className="flex-1">{item.label === 'Admin' ? 'Admin console' : item.label}</span>
                  {current && <span className="bg-saffron size-1.5 rounded-full" aria-hidden />}
                </Link>
              </li>
            )
          })}
        </ul>
      </ResponsiveSheet>
    </>
  )
}

function MoreIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[1.3rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      aria-hidden
    >
      <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="square" />
    </svg>
  )
}

export function AppShell() {
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="bg-saffron text-saffron-foreground sr-only z-50 rounded-md px-3 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Masthead />
      <Topbar />
      <main id="main" className="mx-auto w-full max-w-7xl px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-10 lg:pb-16">
        <div className="mb-5 grid gap-2 empty:hidden">
          <AccessBanner />
          <SyncPill />
        </div>
        <Outlet />
      </main>
      <Tabbar />
      <AddTransactionSheet />
      <PendingSheet />
      <LogoutDialog />
      <PwaUpdatePrompt />
      <PwaInstallPrompt />
    </div>
  )
}
