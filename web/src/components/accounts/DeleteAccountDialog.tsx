import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/api'
import { useAccountUsage, useDeleteAccount, useUpdateAccount } from '@/lib/queries'
import type { Account } from '@/types/api'

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

/**
 * Deleting an account. Only an account nothing refers to can go: one with
 * transactions or recurring rules carries history that makes up its balance,
 * so the dialog says so and offers to deactivate it instead.
 */
export function DeleteAccountDialog({
  account,
  open,
  onOpenChange,
  onDeleted,
}: {
  account: Account | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const usage = useAccountUsage(account?.id ?? '', open)
  const del = useDeleteAccount()
  const update = useUpdateAccount()
  if (!account) return null
  const u = usage.data
  const inUse = !!u && (u.transactions > 0 || u.recurring > 0)
  const what = u
    ? [
        u.transactions > 0 && plural(u.transactions, 'transaction', 'transactions'),
        u.recurring > 0 && plural(u.recurring, 'recurring rule', 'recurring rules'),
      ]
        .filter(Boolean)
        .join(' and ')
    : ''

  const remove = () =>
    del.mutate(account.id, {
      onSuccess: () => {
        toast.success('Account deleted')
        onOpenChange(false)
        onDeleted?.()
      },
      onError: (e) => toast.error(errorMessage(e, 'Could not delete the account')),
    })
  const deactivate = () =>
    update.mutate(
      { id: account.id, is_active: false },
      {
        onSuccess: () => {
          toast.success('Account deactivated')
          onOpenChange(false)
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {inUse ? `${account.name} can't be deleted` : `Delete ${account.name}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {usage.isPending
              ? 'Checking what uses this account…'
              : usage.error
                ? errorMessage(usage.error)
                : inUse
                  ? `It has ${what}. Its history makes up its balance, so delete those first, or deactivate the account to hide it from pickers and keep its history.`
                  : 'Nothing uses this account. It is removed for good.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending || update.isPending}>
            {inUse ? 'Close' : 'Cancel'}
          </AlertDialogCancel>
          {inUse ? (
            account.is_active && (
              <Button onClick={deactivate} disabled={update.isPending}>
                {update.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
                Deactivate instead
              </Button>
            )
          ) : (
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={remove}
              disabled={usage.isPending || !!usage.error || del.isPending}
            >
              {del.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Delete account
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
