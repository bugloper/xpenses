import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { minorToDecimalString, parseAmount } from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * Compact inline amount editor for the preview table. Holds a draft string so
 * partial input ("85.") is typeable, and commits integer minor units on blur or
 * Enter via the float-free `parseAmount`. `nullable` lets an empty field mean
 * "no value" (running balance column); otherwise empty commits 0.
 */
export function MinorInput({
  value,
  onCommit,
  nullable,
  allowNegative,
  className,
  'aria-label': ariaLabel,
  placeholder = '0.00',
}: {
  value: number | null
  onCommit: (minor: number | null) => void
  nullable?: boolean
  allowNegative?: boolean
  className?: string
  'aria-label'?: string
  placeholder?: string
}) {
  const external = value === null ? '' : value === 0 && nullable ? '0.00' : value === 0 ? '' : minorToDecimalString(value)
  const [draft, setDraft] = useState(external)
  const [invalid, setInvalid] = useState(false)
  // Resync the draft when the committed value changes from outside (row reset, undo).
  const [seen, setSeen] = useState(external)
  if (seen !== external) {
    setSeen(external)
    setDraft(external)
    setInvalid(false)
  }
  const pattern = allowNegative ? /^-?\d*(\.\d{0,2})?$/ : /^\d*(\.\d{0,2})?$/
  const commit = () => {
    const s = draft.trim()
    if (s === '') {
      setInvalid(false)
      onCommit(nullable ? null : 0)
      return
    }
    const minor = parseAmount(s)
    if (minor === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onCommit(minor)
  }
  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => {
        const next = e.target.value.replace(/,/g, '')
        if (next === '' || pattern.test(next)) setDraft(next)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      className={cn('tabular h-8 rounded-lg text-right text-sm', className)}
    />
  )
}
