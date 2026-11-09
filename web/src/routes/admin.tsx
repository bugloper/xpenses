import { createRoute, redirect } from '@tanstack/react-router'
import { ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { inviteStatus, InvitesSection } from '@/components/admin/InvitesSection'
import { RegistrationSection } from '@/components/admin/RegistrationSection'
import { accessState, UsersSection } from '@/components/admin/UsersSection'
import { useAdminSettings, useAdminUsers, useInvites } from '@/lib/queries/auth'
import { cn } from '@/lib/utils'
import { appRoute } from './__root'

/** One reading on the console's instrument strip. */
function Gauge({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: ReactNode
  tone?: 'warn' | 'alert' | 'ok'
  hint?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 px-4 py-4 sm:px-5">
      <dt className="text-ink-muted font-mono text-[0.6875rem] tracking-[0.12em] uppercase">{label}</dt>
      <dd
        className={cn(
          'figure text-[2rem] leading-none',
          tone === 'warn' && 'text-saffron',
          tone === 'alert' && 'text-[color:var(--owed)]',
        )}
      >
        {value}
      </dd>
      {hint && <dd className="text-ink-muted truncate text-xs">{hint}</dd>}
    </div>
  )
}

/** The operational numbers, from what the admin queries already return. */
function Overview() {
  const users = useAdminUsers()
  const settings = useAdminSettings()
  const invites = useInvites()
  const list = users.data ?? []
  const dash = '–'
  const n = (v: number) => (users.data ? v : dash)
  const active = list.filter((u) => u.is_active).length
  const admins = list.filter((u) => u.role === 'admin').length
  const ending = list.filter((u) => accessState(u) === 'ending').length
  const expired = list.filter((u) => accessState(u) === 'expired').length
  const open = invites.data?.filter((i) => inviteStatus(i) === 'pending').length
  return (
    <dl className="divide-ink-foreground/12 border-ink-foreground/12 [&>div]:border-ink-foreground/12 grid grid-cols-2 divide-x divide-y border-t sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
      <Gauge
        label="Users"
        value={n(list.length)}
        hint={users.data ? `${active} active · ${list.length - active} disabled` : undefined}
      />
      <Gauge label="Admins" value={n(admins)} hint="No end date" />
      <Gauge
        label="Ending ≤ 30 days"
        value={n(ending)}
        tone={ending > 0 ? 'warn' : undefined}
        hint="Free year running out"
      />
      <Gauge
        label="Expired"
        value={n(expired)}
        tone={expired > 0 ? 'alert' : undefined}
        hint="Need Extend access"
      />
      <Gauge
        label="Registration"
        value={settings.data ? (settings.data.registration_open ? 'Open' : 'Closed') : dash}
        hint={
          settings.data ? (settings.data.registration_open ? 'Anyone can sign up' : 'Invite only') : undefined
        }
      />
      <Gauge label="Open invites" value={open ?? dash} hint="Waiting to be used" />
    </dl>
  )
}

function AdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="bg-ink text-ink-foreground border-ink-foreground/10 overflow-hidden rounded-lg border">
        <div className="flex flex-wrap items-end justify-between gap-4 px-4 pt-5 pb-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <div className="text-saffron mb-2 flex items-center gap-1.5 font-mono text-[0.6875rem] tracking-[0.14em] uppercase">
              <ShieldCheck className="size-3.5" /> Admin console
            </div>
            <h1 className="font-display text-[2rem] leading-[1.05] font-medium sm:text-[2.5rem]">Admin</h1>
            <p className="text-ink-muted mt-2 max-w-prose text-sm">
              Users, registration and invites for this instance.
            </p>
          </div>
          <span className="text-ink-muted font-mono text-[0.6875rem] tracking-[0.12em] uppercase">
            {window.location.host}
          </span>
        </div>
        <Overview />
      </header>
      <UsersSection id="users" />
      <div className="grid items-start gap-6 lg:grid-cols-12">
        <RegistrationSection className="lg:col-span-4" />
        <InvitesSection className="lg:col-span-8" />
      </div>
    </div>
  )
}

export const adminRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin',
  // The root guard already redirects non-admins; this keeps the rule local too.
  beforeLoad: ({ context }) => {
    if (context.auth.user?.role !== 'admin') throw redirect({ to: '/' })
  },
  component: AdminPage,
})
