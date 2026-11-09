import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/api'
import { formatShortDate, isISODate, toISODate, today } from '@/lib/dates'
import { useUpdateAdminUser } from '@/lib/queries/auth'
import type { AdminUser } from '@/types/api'

/** "YYYY-MM-DD" plus a year, from whichever is later: today or the current end. */
function plusOneYear(from: string): string {
  const base = from > today() ? from : today()
  const d = new Date(`${base}T00:00:00`)
  d.setFullYear(d.getFullYear() + 1)
  return toISODate(d)
}

/** Lets the admin set the last day a user may use the app. */
export function ExtendAccessDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const update = useUpdateAdminUser()
  const [date, setDate] = useState('')
  const [seen, setSeen] = useState<AdminUser | null>(null)
  if (seen !== user) {
    setSeen(user)
    setDate(user ? plusOneYear(user.access_until) : '')
  }
  const valid = isISODate(date)
  return (
    <Dialog open={user !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!user || !valid) return
            update.mutate(
              { id: user.id, access_until: date },
              {
                onSuccess: () => {
                  toast.success(`${user.name} can use Xpenses until ${formatShortDate(date)}`)
                  onClose()
                },
                onError: (err) => toast.error(errorMessage(err)),
              },
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>Extend access for {user?.name ?? ''}</DialogTitle>
            <DialogDescription>
              {user?.access_until
                ? `Currently until ${formatShortDate(user.access_until)}.`
                : 'Choose the last day they may use the app.'}{' '}
              The last day is included.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="access-until">Access until</FieldLabel>
            <div className="flex gap-2">
              <Input id="access-until" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Button
                type="button"
                variant="outline"
                onClick={() => setDate(plusOneYear(user?.access_until ?? ''))}
              >
                +1 year
              </Button>
            </div>
            <FieldDescription>A date in the past ends their access today.</FieldDescription>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
