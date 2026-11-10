import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { ArrowLeft, LogOut, Moon, Plus, Sun } from 'lucide-react'
import { LogoutDialog } from '@/components/auth/LogoutDialog'
import { Avatar, MoreSheetUser, RoleBadge } from '@/components/auth/UserBadge'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { AddTransactionSheet } from '@/components/transactions/AddTransactionSheet'
import { useAuth } from '@/lib/auth'
import { uiStore, useUIStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import { AccessBanner } from './AccessBanner'
import { Logo } from './Brand'
import { CurrencyMenu } from './CurrencyMenu'
import { ACCOUNT_NAV, MORE_NAV, PRIMARY_NAV, SETUP_NAV, TAB_NAV, visibleNav, type NavItem } from './nav'
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

/**
 * Desktop: the phone's ink tab bar turned on its side. The mark, the saffron
 * Record key, the screens with the same icons as the tabs (a saffron bar marks
 * the current one), then the account's own screens and Log out, and at the
 * foot who is signed in, the currency and the theme.
 */
function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { user, isAdmin } = useAuth()
  const item = (it: NavItem) => {
    const Icon = it.icon
    const current = isActive(it, pathname)
    return (
      <Link
        key={it.to}
        to={it.to}
        aria-current={current ? 'page' : undefined}
        className={cn(
          'relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
          current
            ? 'bg-ink-foreground/10 text-ink-foreground'
            : 'text-ink-muted hover:bg-ink-foreground/5 hover:text-ink-foreground',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'bg-saffron absolute inset-y-2 -left-3 w-[3px] rounded-r-sm',
            current ? 'opacity-100' : 'opacity-0',
          )}
        />
        <Icon className="size-[1.125rem]" strokeWidth={current ? 2.25 : 1.75} />
        {it.label}
      </Link>
    )
  }
  return (
    <aside className="bg-ink text-ink-foreground fixed inset-y-0 left-0 z-30 hidden w-60 flex-col lg:flex">
      <Link to="/" aria-label="Xpenses home" className="flex h-16 shrink-0 items-center px-5">
        <Logo inverted />
      </Link>
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={() => uiStore.openAdd()}
          aria-label="Add transaction"
          className="bg-saffron text-saffron-foreground flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold shadow-[0_8px_20px_-8px_rgb(0_0_0/0.6)] transition-[filter] hover:brightness-95"
        >
          <Plus className="size-5" strokeWidth={2.75} /> Record
        </button>
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
        {PRIMARY_NAV.map(item)}
        <div className="text-ink-muted/80 mt-5 mb-1.5 px-3 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
          Set up
        </div>
        {SETUP_NAV.map(item)}
        <span className="min-h-5 flex-1" />
        {visibleNav(ACCOUNT_NAV, isAdmin).map(item)}
        <button
          type="button"
          onClick={() => uiStore.requestLogout()}
          className="text-ink-muted hover:bg-ink-foreground/5 hover:text-ink-foreground flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors"
        >
          <LogOut className="size-[1.125rem]" strokeWidth={1.75} />
          Log out
        </button>
      </nav>
      <div className="border-ink-foreground/10 flex flex-col gap-3 border-t px-3 py-3">
        {user && (
          <div className="flex items-center gap-2.5">
            <Avatar user={user} className="size-9" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{user.name}</span>
                <RoleBadge user={user} className="text-saffron h-4 px-1 text-[0.625rem]" />
              </p>
              <p className="text-ink-muted truncate text-xs">{user.email}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <CurrencyMenu />
          <span className="flex-1" />
          <ThemeButton />
        </div>
      </div>
    </aside>
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
                  <span className="flex-1">{item.label}</span>
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
      <Sidebar />
      <Topbar />
      <main
        id="main"
        className="w-full px-4 pt-5 pb-28 sm:px-6 lg:pt-10 lg:pr-8 lg:pb-16 lg:pl-[calc(15rem+2rem)]"
      >
        {/* Desktop keeps the phone's single column, just roomier. */}
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-5 grid gap-2 empty:hidden">
            <AccessBanner />
            <SyncPill />
          </div>
          <Outlet />
        </div>
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
