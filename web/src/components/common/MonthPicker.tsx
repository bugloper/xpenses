import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { currentMonth, formatMonthLabel } from '@/lib/dates'
import { cn } from '@/lib/utils'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * A month label that opens a year-and-month grid, so any month is two taps
 * away instead of a run of arrow presses.
 */
export function MonthPicker({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (yyyymm: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => Number(value.slice(0, 4)))
  const thisMonth = currentMonth()
  const pick = (m: string) => {
    onChange(m)
    setOpen(false)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setYear(Number(value.slice(0, 4)))
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Choose month, currently ${formatMonthLabel(value)}`}
          className={cn(
            'hover:bg-muted font-display inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-xl transition-colors',
            className,
          )}
        >
          {formatMonthLabel(value)}
          <ChevronDown className="text-muted-foreground size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="center">
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Previous year"
            onClick={() => setYear((y) => y - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="text-sm font-semibold tabular-nums">{year}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Next year"
            onClick={() => setYear((y) => y + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1" role="listbox" aria-label={`Months of ${year}`}>
          {MONTHS.map((name, i) => {
            const m = `${year}-${String(i + 1).padStart(2, '0')}`
            const selected = m === value
            return (
              <button
                key={m}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => pick(m)}
                className={cn(
                  'h-9 rounded-md text-sm font-medium transition-colors',
                  selected ? 'bg-foreground text-background' : 'hover:bg-muted',
                  m === thisMonth &&
                    !selected &&
                    'decoration-saffron underline decoration-2 underline-offset-4',
                )}
              >
                {name}
              </button>
            )
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={() => pick(thisMonth)}
        >
          This month
        </Button>
      </PopoverContent>
    </Popover>
  )
}
