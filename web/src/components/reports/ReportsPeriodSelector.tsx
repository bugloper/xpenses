import { DateRangePicker } from '@/components/common/DateRangePicker'
import { rangeLabel, type DateRange } from '@/lib/dates'
import { REPORT_PRESETS, reportPresetRange, type ReportPeriodPreset } from '@/lib/reports'
import { cn } from '@/lib/utils'

/**
 * The statement's period: the presets sit in one index-tab tray, the custom
 * range is a calendar button beside it. On a phone the row scrolls sideways.
 */
export function ReportsPeriodSelector({
  preset,
  range,
  onChange,
  className,
}: {
  preset: ReportPeriodPreset
  range: DateRange
  onChange: (preset: ReportPeriodPreset, range: DateRange) => void
  className?: string
}) {
  const custom = preset === 'custom'
  return (
    <div
      className={cn(
        '-mx-4 flex scrollbar-none items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0',
        className,
      )}
      role="group"
      aria-label="Report period"
    >
      <div className="bg-muted flex shrink-0 gap-0.5 rounded-md border p-0.5">
        {REPORT_PRESETS.map((p) => {
          const on = preset === p.value
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(p.value, reportPresetRange(p.value))}
              className={cn(
                'h-9 shrink-0 rounded-[5px] px-3 text-[0.8125rem] font-medium whitespace-nowrap transition-colors',
                on
                  ? 'bg-card text-foreground shadow-[0_1px_0_0_var(--border),0_1px_3px_-1px_rgb(0_0_0/0.12)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      <DateRangePicker
        value={custom ? range : null}
        placeholder="Custom"
        onChange={(r) => (r ? onChange('custom', r) : onChange('month', reportPresetRange('month')))}
        className={cn(
          'h-10 shrink-0 text-[0.8125rem]',
          custom && 'border-foreground/60 bg-card text-foreground font-medium',
        )}
      />
      <span className="sr-only">{rangeLabel(range)}</span>
    </div>
  )
}
