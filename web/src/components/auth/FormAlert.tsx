import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'

/** Form-level error banner for the auth forms. */
export function FormAlert({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
