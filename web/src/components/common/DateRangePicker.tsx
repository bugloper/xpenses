import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { parseISODate, rangeLabel, toISODate, type DateRange } from '@/lib/dates'
import { cn } from '@/lib/utils'

export function DateRangePicker({
  value,
  onChange,
  className,
  placeholder = 'Date range',
  variant = 'outline',
}: {
  value: DateRange | null
  onChange: (range: DateRange | null) => void
  className?: string
  placeholder?: string
  variant?: 'outline' | 'ghost' | 'secondary'
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DayPickerRange | undefined>()
  const selected: DayPickerRange | undefined =
    draft ??
    (value
      ? { from: parseISODate(value.from) ?? undefined, to: parseISODate(value.to) ?? undefined }
      : undefined)
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setDraft(undefined)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={variant}
          className={cn('h-9 justify-start rounded-xl font-normal', className)}
        >
          <CalendarIcon data-icon="inline-start" className="text-muted-foreground" />
          {value ? rangeLabel(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={1}
          selected={selected}
          defaultMonth={selected?.from}
          onSelect={(r) => {
            setDraft(r)
            if (r?.from && r?.to) {
              onChange({ from: toISODate(r.from), to: toISODate(r.to) })
              setOpen(false)
              setDraft(undefined)
            }
          }}
        />
        <div className="flex justify-between border-t p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(null)
              setDraft(undefined)
              setOpen(false)
            }}
          >
            Clear
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!selected?.from}
            onClick={() => {
              if (selected?.from) {
                const to = selected.to ?? selected.from
                onChange({ from: toISODate(selected.from), to: toISODate(to) })
              }
              setOpen(false)
              setDraft(undefined)
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
