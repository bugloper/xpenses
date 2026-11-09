import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'

/** Form-level error for the auth forms: a ruled note in the margin colour of a correction. */
export function FormAlert({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/[0.06] text-destructive border-l-destructive flex items-start gap-2.5 rounded-md border border-l-[3px] px-3.5 py-3 text-sm"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
