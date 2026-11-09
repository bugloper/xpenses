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
export function ForgotPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow">Xpenses sends no email</p>
          <DialogTitle>Forgot your password?</DialogTitle>
          <DialogDescription>Here is how to get back in.</DialogDescription>
        </DialogHeader>
        <ol className="border-foreground border-t-2">
          {[
            'Ask the administrator of this Xpenses instance for a password reset link.',
            'They create it from Admin → Users → Reset password and send it to you. It works once and for 24 hours.',
            'Open the link, choose a new password, then sign in with it.',
          ].map((step, i) => (
            <li key={step} className="border-rule flex gap-3.5 border-b py-3 text-sm">
              <span className="figure text-saffron w-3 shrink-0 text-lg leading-5">{i + 1}</span>
              <span className="text-foreground/85">{step}</span>
            </li>
          ))}
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
