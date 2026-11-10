import { LogOut, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { initials, useAuth } from '@/lib/auth'
import { avatarUrl } from '@/lib/queries/auth'
import { uiStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import type { User } from '@/types/api'

/** The user's picture when they have set one, else their initials on saffron. */
export function Avatar({ user, className }: { user: User; className?: string }) {
  const src = avatarUrl(user)
  return (
    <span
      aria-hidden
      className={cn(
        'bg-saffron text-saffron-foreground flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md font-mono text-xs font-semibold select-none',
        className,
      )}
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : initials(user.name)}
    </span>
  )
}

export function RoleBadge({ user, className }: { user: User; className?: string }) {
  if (user.role !== 'admin') return null
  return (
    <Badge variant="outline" className={cn('border-saffron/50 text-accent-foreground gap-1', className)}>
      <ShieldCheck /> Admin
    </Badge>
  )
}

/** The user strip at the top of the phone's More sheet. */
export function MoreSheetUser() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <div className="mb-4 flex items-center gap-3 border-b pb-4">
      <Avatar user={user} className="size-11 text-sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-medium">{user.name}</p>
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
