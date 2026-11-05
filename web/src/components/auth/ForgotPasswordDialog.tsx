import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * What to do about a forgotten password. Xpenses sends no email, so the
 * administrator issues a one-time reset link from the Admin page.
 */
export function ForgotPasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Forgot your password?</DialogTitle>
          <DialogDescription>Here is how to get back in.</DialogDescription>
        </DialogHeader>
        <ol className="text-muted-foreground list-decimal space-y-2 pl-5 text-sm">
          <li>Ask the administrator of this Xpenses instance for a password reset link.</li>
          <li>They create it from Admin → Users → Reset password and send it to you. It works once and for 24 hours.</li>
          <li>Open the link, choose a new password, then sign in with it.</li>
        </ol>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
