import type { ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive,
  onConfirm,
  loading,
  hideConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
  loading?: boolean
  /** Only explain (the action isn't possible): the dialog offers Close alone. */
  hideConfirm?: boolean
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{hideConfirm ? 'Close' : 'Cancel'}</AlertDialogCancel>
          {!hideConfirm && (
            <AlertDialogAction
              disabled={loading}
              className={cn(
                destructive && buttonVariants({ variant: 'destructive' }),
                destructive && 'bg-destructive hover:bg-destructive/90 text-white',
              )}
              onClick={(e) => {
                e.preventDefault()
                void Promise.resolve(onConfirm()).then(() => onOpenChange(false))
              }}
            >
              {confirmLabel}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
