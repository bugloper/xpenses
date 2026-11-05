import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatShortDate, isISODate, parseISODate, toISODate, today, yesterday } from '@/lib/dates'
import { cn } from '@/lib/utils'

/** Single-date picker: quick chips (Today / Yesterday) + calendar popover. */
export function DateField({
  value,
  onChange,
  quickChips = true,
  id,
  className,
  invalid,
}: {
  value: string
  onChange: (iso: string) => void
  quickChips?: boolean
  id?: string
  className?: string
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const t = today()
  const y = yesterday()
  const selected = parseISODate(value) ?? undefined
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {quickChips && (
        <>
          <Chip active={value === t} onClick={() => onChange(t)}>
            Today
          </Chip>
          <Chip active={value === y} onClick={() => onChange(y)}>
            Yesterday
          </Chip>
        </>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={invalid}
            className={cn(
              'h-9 justify-start rounded-xl font-normal',
              value !== t && value !== y && 'border-foreground bg-foreground text-background hover:bg-foreground/90',
            )}
          >
            <CalendarIcon data-icon="inline-start" className="text-muted-foreground" />
            {value ? formatShortDate(value) : 'Pick a date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          {/* Type a date to jump straight to it; the grid below follows. */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <label htmlFor={`${id ?? 'date'}-typed`} className="text-muted-foreground text-xs">
              Go to
            </label>
            <input
              id={`${id ?? 'date'}-typed`}
              type="date"
              value={value}
              onChange={(e) => {
                if (isISODate(e.target.value)) onChange(e.target.value)
              }}
              className="bg-background h-8 flex-1 rounded-lg border px-2 text-sm"
            />
          </div>
          <Calendar
            mode="single"
            captionLayout="dropdown"
            startMonth={new Date(2015, 0)}
            endMonth={new Date(new Date().getFullYear() + 2, 11)}
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              if (d) onChange(toISODate(d))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-9 rounded-xl border px-3 text-sm font-medium transition-colors',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}
