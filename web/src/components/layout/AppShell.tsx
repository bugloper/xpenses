import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { uiStore, useUIStore } from '@/lib/ui-store'
import { AddTransactionSheet } from '@/components/transactions/AddTransactionSheet'
import { ALL_NAV, MORE_NAV, PRIMARY_NAV, type NavItem } from './nav'
import { PendingSheet } from './PendingSheet'
import { PwaUpdatePrompt } from './PwaUpdatePrompt'
import { SyncPill } from './SyncPill'
import { ThemeToggle } from './ThemeToggle'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'

function useActive(item: NavItem) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + '/')
}

function SidebarLink({ item }: { item: NavItem }) {
  const active = useActive(item)
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      className={cn(
        'flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
        active
          ? 'bg-sidebar-accent text-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
      )}
    >
      <Icon className={cn('size-4.5', active && 'text-primary')} />
      {item.label}
    </Link>
  )
}

function Sidebar() {
  return (
    <aside className="bg-sidebar fixed inset-y-0 left-0 hidden w-60 flex-col border-r px-3 py-4 lg:flex">
      <div className="flex items-center gap-2 px-3 py-1">
        <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
          <Logo />
        </span>
        <span className="font-heading text-lg font-semibold tracking-tight">Xpensiv</span>
      </div>
      <Button
        size="lg"
        className="mt-5 h-11 rounded-xl text-sm"
        onClick={() => uiStore.openAdd()}
        aria-label="Add transaction"
      >
        <Plus data-icon="inline-start" /> Add transaction
      </Button>
      <nav className="mt-5 flex flex-1 flex-col gap-0.5">
        {ALL_NAV.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>
      <div className="flex items-center justify-between px-1">
        <SyncPill />
        <ThemeToggle />
      </div>
    </aside>
  )
}

function Logo() {
  return (
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
  )
}

function BottomNavLink({ item }: { item: NavItem }) {
  const active = useActive(item)
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors',
        active ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <Icon className="size-5" />
      {item.label}
    </Link>
  )
}

function BottomNav() {
  const { moreOpen } = useUIStore()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const moreActive = MORE_NAV.some((i) => pathname === i.to || pathname.startsWith(i.to + '/'))
  const [dashboard, transactions, reports] = PRIMARY_NAV as [NavItem, NavItem, NavItem]
  return (
    <>
      <nav className="safe-bottom bg-background/95 supports-backdrop-filter:bg-background/80 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur lg:hidden">
        <div className="relative flex h-16 items-stretch">
          <BottomNavLink item={dashboard} />
          <BottomNavLink item={transactions} />
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              onClick={() => uiStore.openAdd()}
              aria-label="Add transaction"
              className="bg-primary text-primary-foreground shadow-primary/30 ring-background -mt-7 flex size-14 items-center justify-center rounded-full shadow-lg ring-4 transition-transform active:scale-95"
            >
              <Plus className="size-7" strokeWidth={2.5} />
            </button>
          </div>
          <BottomNavLink item={reports} />
          <button
            type="button"
            onClick={() => uiStore.setMore(true)}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors',
              moreActive ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <MoreIcon />
            More
          </button>
        </div>
      </nav>
      <ResponsiveSheet open={moreOpen} onOpenChange={uiStore.setMore} title="More">
        <div className="grid grid-cols-2 gap-2 pb-2">
          {MORE_NAV.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => uiStore.setMore(false)}
                className="bg-background hover:bg-muted flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-medium"
              >
                <Icon className="text-primary size-4.5" />
                {item.label}
              </Link>
            )
          })}
        </div>
      </ResponsiveSheet>
    </>
  )
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  )
}

function MobileHeader() {
  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 backdrop-blur lg:hidden">
      <Link to="/" className="flex items-center gap-2">
        <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md">
          <Logo />
        </span>
        <span className="font-heading text-base font-semibold tracking-tight">Xpensiv</span>
      </Link>
      <div className="flex items-center gap-1">
        <SyncPill />
        <ThemeToggle />
      </div>
    </header>
  )
}

export function AppShell() {
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <Sidebar />
      <div className="flex min-h-dvh flex-col lg:pl-60">
        <MobileHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-28 lg:px-8 lg:pt-8 lg:pb-12">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <AddTransactionSheet />
      <PendingSheet />
      <PwaUpdatePrompt />
      <Toaster position="top-center" richColors closeButton />
    </div>
  )
}
