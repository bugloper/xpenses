import { DateRangePicker } from '@/components/common/DateRangePicker'
import { presetRange, rangeLabel, type DateRange, type PeriodPreset } from '@/lib/dates'
import { cn } from '@/lib/utils'

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'prev_month', label: 'Previous month' },
]

export function PeriodSelector({
  preset,
  range,
  onChange,
}: {
  preset: PeriodPreset
  range: DateRange
  onChange: (preset: PeriodPreset, range: DateRange) => void
}) {
  return (
    <div className="-mx-4 flex scrollbar-none items-center gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      {PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          aria-pressed={preset === p.value}
          onClick={() => onChange(p.value, presetRange(p.value))}
          className={cn(
            'h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors',
            preset === p.value
              ? 'border-foreground bg-foreground text-background'
              : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {p.label}
        </button>
      ))}
      <DateRangePicker
        value={preset === 'custom' ? range : null}
        placeholder="Custom"
        onChange={(r) => (r ? onChange('custom', r) : onChange('month', presetRange('month')))}
        className={cn(
          'h-9 shrink-0 rounded-full',
          preset === 'custom' && 'border-foreground bg-foreground text-background',
        )}
      />
      <span className="sr-only">{rangeLabel(range)}</span>
    </div>
  )
}
