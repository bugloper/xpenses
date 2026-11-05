import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
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
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { relativeTime } from '@/lib/dates'
import {
  useAdminUsers,
  useCreatePasswordReset,
  useDeleteAdminUser,
  useUpdateAdminUser,
} from '@/lib/queries/auth'
import type { AdminUser, CreatedPasswordReset } from '@/types/api'
import { LinkDialog } from './LinkDialog'

function UserActions({
  u,
  self,
  onDelete,
  onReset,
}: {
  u: AdminUser
  self: boolean
  onDelete: () => void
  onReset: (r: CreatedPasswordReset) => void
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
        <Button size="sm" variant="ghost" aria-label={`Actions for ${u.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => reset.mutate(u.id, { onSuccess: onReset, onError: (e) => toast.error(errorMessage(e)) })}
        >
          Reset password…
        </DropdownMenuItem>
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

export function UsersSection() {
  const { user: me } = useAuth()
  const { data, isPending, error, refetch } = useAdminUsers()
  const del = useDeleteAdminUser()
  const [doomed, setDoomed] = useState<AdminUser | null>(null)
  const [reset, setReset] = useState<{ user: AdminUser; link: CreatedPasswordReset } | null>(null)
  if (isPending) return <Skeleton className="h-40 w-full rounded-[1.25rem]" />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} compact />
  return (
    <>
      <div className="bg-card border rounded-[1.25rem]">
        {/* Table on wide screens */}
        <table className="hidden w-full text-sm sm:table">
          <thead className="text-muted-foreground text-xs">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">User</th>
              <th className="px-2 py-3 text-left font-medium">Role</th>
              <th className="px-2 py-3 text-left font-medium">Status</th>
              <th className="px-2 py-3 text-right font-medium">Accounts</th>
              <th className="px-2 py-3 text-right font-medium">Transactions</th>
              <th className="px-2 py-3 text-left font-medium">Last login</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((u) => {
              const self = u.id === me?.id
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {u.name}
                      {self && <span className="text-muted-foreground font-normal"> (you)</span>}
                    </p>
                    <p className="text-muted-foreground text-xs">{u.email}</p>
                  </td>
                  <td className="px-2 py-3">
                    <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
                  </td>
                  <td className="px-2 py-3">
                    <Badge variant={u.is_active ? 'outline' : 'destructive'}>
                      {u.is_active ? 'Active' : 'Disabled'}
                    </Badge>
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">{u.account_count}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{u.transaction_count}</td>
                  <td className="text-muted-foreground px-2 py-3 text-xs">
                    {u.last_login_at ? relativeTime(u.last_login_at) : 'never'}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <UserActions
                      u={u}
                      self={self}
                      onDelete={() => setDoomed(u)}
                      onReset={(link) => setReset({ user: u, link })}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {/* Cards on phones */}
        <ul className="divide-y sm:hidden">
          {data.map((u) => {
            const self = u.id === me?.id
            return (
              <li key={u.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-medium">
                      {u.name}
                      {self && <span className="text-muted-foreground font-normal"> (you)</span>}
                    </p>
                    <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
                    {!u.is_active && <Badge variant="destructive">Disabled</Badge>}
                  </div>
                  <p className="text-muted-foreground truncate text-xs">{u.email}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {u.account_count} accounts · {u.transaction_count} transactions · last login{' '}
                    {u.last_login_at ? relativeTime(u.last_login_at) : 'never'}
                  </p>
                </div>
                <UserActions
                      u={u}
                      self={self}
                      onDelete={() => setDoomed(u)}
                      onReset={(link) => setReset({ user: u, link })}
                    />
              </li>
            )
          })}
        </ul>
      </div>
      <LinkDialog
        open={reset !== null}
        onClose={() => setReset(null)}
        title={`Password reset link for ${reset?.user.name ?? ''}`}
        label="Reset link"
        url={reset ? window.location.origin + reset.link.reset_path : ''}
        note={
          reset
            ? `Send it to ${reset.user.email}. It works once and expires ${relativeTime(reset.link.expires_at)}; their other sessions are signed out when it is used.`
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
    </>
  )
}
