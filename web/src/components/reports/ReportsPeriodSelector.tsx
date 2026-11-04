import { DateRangePicker } from '@/components/common/DateRangePicker'
import { rangeLabel, type DateRange } from '@/lib/dates'
import { REPORT_PRESETS, reportPresetRange, type ReportPeriodPreset } from '@/lib/reports'
import { cn } from '@/lib/utils'

export function ReportsPeriodSelector({
  preset,
  range,
  onChange,
}: {
  preset: ReportPeriodPreset
  range: DateRange
  onChange: (preset: ReportPeriodPreset, range: DateRange) => void
}) {
  return (
    <div
      className="-mx-4 flex scrollbar-none items-center gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0"
      role="group"
      aria-label="Report period"
    >
      {REPORT_PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          aria-pressed={preset === p.value}
          onClick={() => onChange(p.value, reportPresetRange(p.value))}
          className={cn(
            'h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors',
            preset === p.value
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {p.label}
        </button>
      ))}
      <DateRangePicker
        value={preset === 'custom' ? range : null}
        placeholder="Custom"
        onChange={(r) => (r ? onChange('custom', r) : onChange('month', reportPresetRange('month')))}
        className={cn(
          'h-9 shrink-0 rounded-full',
          preset === 'custom' && 'border-primary bg-primary/10 text-primary',
        )}
      />
      <span className="sr-only">{rangeLabel(range)}</span>
    </div>
  )
}
