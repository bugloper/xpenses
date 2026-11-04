import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { ChevronLeft, Moon, Plus, Sun } from 'lucide-react'
import { LogoutDialog } from '@/components/auth/LogoutDialog'
import { Avatar, MoreSheetUser, SidebarUser } from '@/components/auth/UserBadge'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { AddTransactionSheet } from '@/components/transactions/AddTransactionSheet'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { uiStore, useUIStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import { Logo } from './Brand'
import { ALL_NAV, MORE_NAV, PRIMARY_NAV, visibleNav, type NavItem } from './nav'
import { PendingSheet } from './PendingSheet'
import { PwaInstallPrompt } from './PwaInstallPrompt'
import { PwaUpdatePrompt } from './PwaUpdatePrompt'
import { SyncPill } from './SyncPill'
import { useTheme } from './ThemeProvider'

function isActive(item: NavItem, pathname: string) {
  return item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + '/')
}

/** What the top bar says, and where its back arrow goes, for the screen we are on. */
function pageFor(pathname: string): { title: string; back?: string } {
  const [first = '', second] = pathname.split('/').filter(Boolean)
  if (first === 'transactions' && second) return { title: 'Transaction', back: '/transactions' }
  if (first === 'accounts' && second) return { title: 'Account', back: '/accounts' }
  if (first === 'add') return { title: 'Add transaction', back: '/' }
  const item = ALL_NAV.find((i) => (i.exact ? pathname === i.to : first === i.to.slice(1)))
  return { title: item?.label ?? 'Xpensiv' }
}

function Sidebar() {
  const { isAdmin } = useAuth()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return (
    <aside className="bg-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r md:flex">
      <div className="flex h-18 items-center px-5">
        <Logo sub="Expense tracker" />
      </div>
      <div className="px-3 pb-2">
        <Button className="w-full" size="lg" onClick={() => uiStore.openAdd()} aria-label="Add transaction">
          <Plus /> Add transaction
        </Button>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {visibleNav(ALL_NAV, isAdmin).map((item) => {
          const Icon = item.icon
          const current = isActive(item, pathname)
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'group flex h-10 items-center gap-3 rounded-full px-3.5 text-sm font-medium transition-colors',
                current ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon
                className={cn(
                  'size-[1.0625rem]',
                  current ? 'text-background' : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              <span className="flex-1">{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="border-t p-3">
        <SidebarUser />
      </div>
    </aside>
  )
}

/** A round button in the header, the way a centred title is framed. */
const roundButton =
  'relative inline-flex size-11 shrink-0 items-center justify-center rounded-full border bg-card text-foreground transition-colors hover:bg-muted'

function Topbar() {
  const { user } = useAuth()
  const { theme, toggle } = useTheme()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const page = pageFor(pathname)
  return (
    <header className="bg-background/85 sticky top-0 z-20 grid h-16 grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2 px-4 backdrop-blur-xl sm:px-6 md:h-18 md:px-8">
      {page.back ? (
        <Link to={page.back} aria-label="Back" className={roundButton}>
          <ChevronLeft className="size-5" />
        </Link>
      ) : user ? (
        <Link to="/settings" aria-label="Your profile" className="rounded-full md:invisible">
          <Avatar user={user} className="size-11 text-sm" />
        </Link>
      ) : (
        <span />
      )}
      <div className="min-w-0 truncate text-center text-lg font-semibold tracking-tight md:invisible">{page.title}</div>
      <button type="button" onClick={toggle} aria-label="Toggle theme" className={roundButton}>
        {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </button>
    </header>
  )
}

/** The bar along the bottom of a phone, with the round + in the middle. */
function Tabbar() {
  const { moreOpen } = useUIStore()
  const { isAdmin } = useAuth()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const moreActive = MORE_NAV.some((i) => isActive(i, pathname))
  const [dashboard, transactions, reports] = PRIMARY_NAV as [NavItem, NavItem, NavItem]
  const tab = (item: NavItem) => {
    const Icon = item.icon
    const current = isActive(item, pathname)
    return (
      <Link
        key={item.to}
        to={item.to}
        className={cn(
          'relative flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors',
          current ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <Icon className="size-[1.375rem]" strokeWidth={current ? 2.5 : 1.75} />
        {item.label}
      </Link>
    )
  }
  return (
    <>
      <nav aria-label="Main" className="safe-bottom bg-card/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {tab(dashboard)}
          {tab(transactions)}
          <div className="flex justify-center">
            <button
              type="button"
              aria-label="Add transaction"
              onClick={() => uiStore.openAdd()}
              className="bg-primary text-primary-foreground shadow-primary/40 ring-background -mt-6 flex size-15 items-center justify-center rounded-full shadow-lg ring-6 transition-transform active:scale-95"
            >
              <Plus className="size-7" strokeWidth={2.5} />
            </button>
          </div>
          {tab(reports)}
          <button
            type="button"
            onClick={() => uiStore.setMore(true)}
            className={cn(
              'relative flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors',
              moreActive ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <MoreIcon bold={moreActive} />
            More
          </button>
        </div>
      </nav>
      <ResponsiveSheet open={moreOpen} onOpenChange={uiStore.setMore} title="More">
        <MoreSheetUser />
        <div className="grid grid-cols-2 gap-2 pb-2">
          {visibleNav(MORE_NAV, isAdmin).map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => uiStore.setMore(false)}
                className="bg-card hover:bg-muted/60 flex items-center gap-3 rounded-[1.25rem] border px-3 py-3 text-sm font-medium"
              >
                <span className="bg-accent text-primary flex size-9 items-center justify-center rounded-full">
                  <Icon className="size-4.5" />
                </span>
                {item.label}
              </Link>
            )
          })}
        </div>
      </ResponsiveSheet>
    </>
  )
}

function MoreIcon({ bold }: { bold: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.375rem]" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r={bold ? 2.4 : 2} />
      <circle cx="12" cy="12" r={bold ? 2.4 : 2} />
      <circle cx="19" cy="12" r={bold ? 2.4 : 2} />
    </svg>
  )
}

export function AppShell() {
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div className="md:pl-64">
        <Topbar />
        <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-28 sm:px-6 md:px-8 md:pt-6 md:pb-12">
          <div className="mb-4 grid gap-2 empty:hidden">
            <SyncPill />
          </div>
          <Outlet />
        </main>
        <Tabbar />
      </div>
      <AddTransactionSheet />
      <PendingSheet />
      <LogoutDialog />
      <PwaUpdatePrompt />
      <PwaInstallPrompt />
    </div>
  )
}
