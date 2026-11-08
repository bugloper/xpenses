import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { countPending, syncManager } from '@/lib/offline'
import { performLogout } from '@/lib/queries/auth'
import { uiStore, useUIStore } from '@/lib/ui-store'

/**
 * Logout flow. Opened through `uiStore.requestLogout()`:
 * - no unsynced items for this user → logs out immediately;
 * - otherwise asks "Sync now" / "Log out anyway". Items are never discarded:
 *   they stay in IndexedDB under this user's id and sync on the next sign-in.
 */
export function LogoutDialog() {
  const { logoutOpen } = useUIStore()
  // Mounted only while open so every attempt starts from a clean state.
  return logoutOpen ? <LogoutFlow /> : null
}

function LogoutFlow() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [unsynced, setUnsynced] = useState<number | null>(null)
  const [busy, setBusy] = useState<'sync' | 'logout' | null>(null)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const userId = user?.id ?? null

  const finish = async () => {
    setBusy('logout')
    try {
      await performLogout()
      uiStore.setLogout(false)
      await navigate({ to: '/', replace: true })
    } catch (e) {
      toast.error(errorMessage(e, 'Could not log out'))
      setBusy(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    void countPending(userId).then((c) => {
      if (cancelled) return
      const n = c.pending + c.syncing + c.failed
      if (n === 0) void finish()
      else setUnsynced(n)
    })
    return () => {
      cancelled = true
    }
    // Runs once per mount (the dialog remounts for every logout attempt).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const syncNow = async () => {
    setBusy('sync')
    setSyncNote(null)
    try {
      await syncManager.syncNow({ force: true })
      const c = await countPending(userId)
      const left = c.pending + c.syncing + c.failed
      if (left === 0) {
        toast.success('Everything synced')
        await finish()
        return
      }
      setUnsynced(left)
      setSyncNote(
        syncManager.getState().lastError ??
          (c.failed > 0 ? 'Some items were rejected by the server. Fix them from the offline queue.' : null),
      )
      setBusy(null)
    } catch (e) {
      setSyncNote(errorMessage(e))
      setBusy(null)
    }
  }

  if (unsynced === null) return null
  return (
    <AlertDialog open onOpenChange={(o) => !o && !busy && uiStore.setLogout(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            You have {unsynced} unsynced transaction{unsynced === 1 ? '' : 's'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {unsynced === 1 ? 'It has' : 'They have'} not reached the server yet. Sync now, or log out and{' '}
            {unsynced === 1 ? 'it' : 'they'} will stay on this device until you sign in again.
            {syncNote && <span className="text-destructive mt-2 block">{syncNote}</span>}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" disabled={busy !== null} onClick={() => uiStore.setLogout(false)}>
            Cancel
          </Button>
          <Button variant="secondary" disabled={busy !== null} onClick={() => void finish()}>
            {busy === 'logout' ? 'Logging out…' : 'Log out anyway'}
          </Button>
          <Button disabled={busy !== null} onClick={() => void syncNow()}>
            {busy === 'sync' ? 'Syncing…' : 'Sync now'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
