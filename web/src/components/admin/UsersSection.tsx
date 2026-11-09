import { MoreHorizontal, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Panel } from '@/components/common/kit'
import { Segmented } from '@/components/common/Segmented'
import { ErrorState } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/api'
import { accessDaysLeft, initials, useAuth } from '@/lib/auth'
import { formatDateTime, formatShortDate, relativeTime } from '@/lib/dates'
import {
  useAdminUsers,
  useCreatePasswordReset,
  useDeleteAdminUser,
  useUpdateAdminUser,
} from '@/lib/queries/auth'
import { cn } from '@/lib/utils'
import type { AdminUser, CreatedPasswordReset } from '@/types/api'
import { ExtendAccessDialog } from './ExtendAccessDialog'
import { LinkDialog } from './LinkDialog'

/** Where a user stands on their free year. Admins have no end date. */
export type AccessState = 'exempt' | 'open' | 'ending' | 'expired'
export function accessState(u: Pick<AdminUser, 'role' | 'access_until'>, now = new Date()): AccessState {
  const left = accessDaysLeft(u, now)
  if (left === null) return 'exempt'
  if (left < 0) return 'expired'
  if (left <= 30) return 'ending'
  return 'open'
}

type Filter = 'all' | 'active' | 'ending' | 'expired' | 'disabled'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'ending', label: 'Ending soon' },
  { value: 'expired', label: 'Expired' },
  { value: 'disabled', label: 'Disabled' },
]

function matches(u: AdminUser, filter: Filter, query: string) {
  const q = query.trim().toLowerCase()
  if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false
  switch (filter) {
    case 'active':
      return u.is_active
    case 'ending':
      return accessState(u) === 'ending'
    case 'expired':
      return accessState(u) === 'expired'
    case 'disabled':
      return !u.is_active
    default:
      return true
  }
}

/** "Until 8 Nov 2027" for users, "No end date" for admins, the expired state in red. */
function AccessCell({ u }: { u: AdminUser }) {
  const left = accessDaysLeft(u)
  if (left === null) return <span className="text-muted-foreground">No end date</span>
  if (left < 0) return <Badge variant="destructive">Expired {formatShortDate(u.access_until)}</Badge>
  return (
    <span className={cn('whitespace-nowrap', left <= 30 && 'text-warn font-medium')}>
      {formatShortDate(u.access_until)}
      {left <= 30 && <span className="font-normal"> · {left === 0 ? 'last day' : `${left} days`}</span>}
    </span>
  )
}

/** Initials only: profile pictures are served for the signed-in user alone. */
function Monogram({ u }: { u: AdminUser }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-semibold',
        u.role === 'admin'
          ? 'border-saffron/50 bg-saffron-soft text-accent-foreground'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {initials(u.name)}
    </span>
  )
}

function RoleTag({ u }: { u: AdminUser }) {
  return u.role === 'admin' ? (
    <Badge variant="outline" className="border-saffron/50 text-accent-foreground">
      Admin
    </Badge>
  ) : (
    <Badge variant="secondary">User</Badge>
  )
}

function StatusTag({ u }: { u: AdminUser }) {
  return u.is_active ? (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      <span aria-hidden className="bg-income size-1.5 rounded-full" /> Active
    </span>
  ) : (
    <Badge variant="destructive">Disabled</Badge>
  )
}

function UserActions({
  u,
  self,
  onDelete,
  onReset,
  onExtend,
}: {
  u: AdminUser
  self: boolean
  onDelete: () => void
  onReset: (r: CreatedPasswordReset) => void
  onExtend: () => void
}) {
  const update = useUpdateAdminUser()
  const reset = useCreatePasswordReset()
  const act = (body: { is_active?: boolean; role?: 'admin' | 'user' }, done: string) =>
    update.mutate(
      { id: u.id, ...body },
      { onSuccess: () => toast.success(done), onError: (e) => toast.error(errorMessage(e)) },
    )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-10 md:size-8"
          aria-label={`Actions for ${u.name}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() =>
            reset.mutate(u.id, { onSuccess: onReset, onError: (e) => toast.error(errorMessage(e)) })
          }
        >
          Reset password…
        </DropdownMenuItem>
        {u.role !== 'admin' && <DropdownMenuItem onSelect={onExtend}>Extend access…</DropdownMenuItem>}
        {!self && (
          <>
            {u.is_active ? (
              <DropdownMenuItem onSelect={() => act({ is_active: false }, `${u.name} disabled`)}>
                Disable
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => act({ is_active: true }, `${u.name} enabled`)}>
                Enable
              </DropdownMenuItem>
            )}
            {u.role === 'admin' ? (
              <DropdownMenuItem onSelect={() => act({ role: 'user' }, `${u.name} is now a user`)}>
                Demote to user
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => act({ role: 'admin' }, `${u.name} is now an admin`)}>
                Promote to admin
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              Delete user…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const TH = 'eyebrow px-3 py-2.5 text-left font-normal'

export function UsersSection({ id }: { id?: string }) {
  const { user: me } = useAuth()
  const { data, isPending, error, refetch } = useAdminUsers()
  const del = useDeleteAdminUser()
  const [doomed, setDoomed] = useState<AdminUser | null>(null)
  const [reset, setReset] = useState<{ user: AdminUser; link: CreatedPasswordReset } | null>(null)
  const [extending, setExtending] = useState<AdminUser | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const shown = useMemo(() => (data ?? []).filter((u) => matches(u, filter, query)), [data, filter, query])

  const actions = (u: AdminUser) => (
    <UserActions
      u={u}
      self={u.id === me?.id}
      onDelete={() => setDoomed(u)}
      onReset={(link) => setReset({ user: u, link })}
      onExtend={() => setExtending(u)}
    />
  )
  const you = (u: AdminUser) =>
    u.id === me?.id && <span className="text-muted-foreground font-normal"> (you)</span>

  return (
    <Panel
      id={id}
      title="Users"
      description={data ? `${data.length} on this instance. Each sees only their own data.` : undefined}
      flush
    >
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:px-5 md:flex-row md:items-center md:justify-between">
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <Segmented
            aria-label="Show users"
            size="sm"
            className="w-max sm:w-max"
            value={filter}
            onChange={setFilter}
            options={FILTERS}
          />
        </div>
        <div className="relative md:w-64">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or email"
            aria-label="Find a user"
            className="h-9 pl-9"
          />
        </div>
      </div>
      {isPending ? (
        <div className="p-5">
          <Skeleton className="h-40 w-full rounded-md" />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} compact />
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground px-5 py-10 text-center text-sm">No user matches.</p>
      ) : (
        <>
          {/* A table on wide screens */}
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b">
                <th className={cn(TH, 'pl-5')}>User</th>
                <th className={TH}>Role</th>
                <th className={TH}>Status</th>
                <th className={TH}>Joined</th>
                <th className={TH}>Last login</th>
                <th className={cn(TH, 'text-right')}>Accts · Txns</th>
                <th className={TH}>Access until</th>
                <th className="w-12 pr-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-rule divide-y">
              {shown.map((u) => (
                <tr
                  key={u.id}
                  className={cn('hover:bg-muted/40 transition-colors', !u.is_active && 'bg-muted/30')}
                >
                  <td className="py-3 pr-3 pl-5">
                    <div className="flex items-center gap-3">
                      <Monogram u={u} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {u.name}
                          {you(u)}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <RoleTag u={u} />
                  </td>
                  <td className="px-3 py-3">
                    <StatusTag u={u} />
                  </td>
                  <td className="text-muted-foreground px-3 py-3 text-xs whitespace-nowrap">
                    {formatShortDate(u.created_at.slice(0, 10))}
                  </td>
                  <td className="text-muted-foreground px-3 py-3 text-xs whitespace-nowrap">
                    {u.last_login_at ? relativeTime(u.last_login_at) : 'never'}
                  </td>
                  <td className="text-muted-foreground px-3 py-3 text-right font-mono text-xs tabular-nums">
                    {u.account_count} · {u.transaction_count}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <AccessCell u={u} />
                  </td>
                  <td className="py-3 pr-3 text-right">{actions(u)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Rows on phones */}
          <ul className="divide-rule divide-y md:hidden">
            {shown.map((u) => (
              <li
                key={u.id}
                className={cn('flex items-start gap-3 py-3 pr-2 pl-4', !u.is_active && 'bg-muted/30')}
              >
                <Monogram u={u} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-medium">
                      {u.name}
                      {you(u)}
                    </p>
                    <RoleTag u={u} />
                    {!u.is_active && <Badge variant="destructive">Disabled</Badge>}
                  </div>
                  <p className="text-muted-foreground truncate text-xs">{u.email}</p>
                  <p className="mt-1.5 text-xs">
                    <span className="eyebrow mr-1.5">Access</span>
                    <AccessCell u={u} />
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {u.account_count} accounts · {u.transaction_count} transactions · last login{' '}
                    {u.last_login_at ? relativeTime(u.last_login_at) : 'never'}
                  </p>
                </div>
                {actions(u)}
              </li>
            ))}
          </ul>
        </>
      )}
      <ExtendAccessDialog user={extending} onClose={() => setExtending(null)} />
      <LinkDialog
        open={reset !== null}
        onClose={() => setReset(null)}
        title={`Password reset link for ${reset?.user.name ?? ''}`}
        label="Reset link"
        url={reset ? window.location.origin + reset.link.reset_path : ''}
        note={
          reset
            ? `Send it to ${reset.user.email}. It works once and expires ${formatDateTime(reset.link.expires_at)}; their other sessions are signed out when it is used.`
            : undefined
        }
      />
      <ConfirmDialog
        open={doomed !== null}
        onOpenChange={(o) => !o && setDoomed(null)}
        title={`Delete ${doomed?.name ?? 'this user'}?`}
        description={`${doomed?.email ?? ''} and all of their data - ${doomed?.account_count ?? 0} accounts, ${doomed?.transaction_count ?? 0} transactions, categories, budgets and settings - will be deleted permanently. This cannot be undone.`}
        confirmLabel="Delete user and data"
        destructive
        loading={del.isPending}
        onConfirm={async () => {
          if (!doomed) return
          try {
            await del.mutateAsync(doomed.id)
            toast.success(`${doomed.name} deleted`)
          } catch (e) {
            toast.error(errorMessage(e))
          }
        }}
      />
    </Panel>
  )
}
