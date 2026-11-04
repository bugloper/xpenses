import { Link } from '@tanstack/react-router'
import { ChevronsUpDown, LogOut, Settings, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { initials, useAuth } from '@/lib/auth'
import { uiStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import type { User } from '@/types/api'

export function Avatar({ user, className }: { user: User; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        className,
      )}
    >
      {initials(user.name)}
    </span>
  )
}

export function RoleBadge({ user }: { user: User }) {
  if (user.role !== 'admin') return null
  return (
    <Badge variant="outline" className="border-primary/40 text-primary gap-1">
      <ShieldCheck /> Admin
    </Badge>
  )
}

/** Sidebar footer: who is signed in, with Settings / Log out. */
export function SidebarUser() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hover:bg-sidebar-accent/60 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors"
          aria-label={`Signed in as ${user.name}`}
        >
          <Avatar user={user} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{user.name}</span>
              <RoleBadge user={user} />
            </span>
            <span className="text-muted-foreground block truncate text-xs">{user.email}</span>
          </span>
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => uiStore.requestLogout()}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The user card at the top of the mobile "More" sheet. */
export function MoreSheetUser() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <div className="bg-background mb-3 flex items-center gap-3 rounded-xl border px-3 py-3">
      <Avatar user={user} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <RoleBadge user={user} />
        </div>
        <p className="text-muted-foreground truncate text-xs">{user.email}</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => uiStore.requestLogout()}>
        <LogOut data-icon="inline-start" /> Log out
      </Button>
    </div>
  )
}
