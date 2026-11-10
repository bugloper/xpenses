import { DateRangePicker } from '@/components/common/DateRangePicker'
import { PERIOD_PRESETS, presetRange, rangeLabel, type DateRange, type PeriodPreset } from '@/lib/dates'
import { cn } from '@/lib/utils'

const TAB =
  'h-8 shrink-0 rounded-[5px] px-3 text-[0.8125rem] font-medium whitespace-nowrap transition-colors sm:px-3.5'
const TAB_ON = 'bg-card text-foreground shadow-[0_1px_0_0_var(--border),0_1px_3px_-1px_rgb(0_0_0/0.12)]'
const TAB_OFF = 'text-muted-foreground hover:text-foreground'

/**
 * The period every screen reports on, as index tabs in a tray: the presets and a custom
 * range at the end. Scrolls sideways on a narrow phone rather than wrapping.
 */
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
    <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="group" aria-label="Period" className="bg-muted inline-flex gap-0.5 rounded-md border p-0.5">
        {PERIOD_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            aria-pressed={preset === p.value}
            onClick={() => onChange(p.value, presetRange(p.value))}
            className={cn(TAB, preset === p.value ? TAB_ON : TAB_OFF)}
          >
            {p.label}
          </button>
        ))}
        <DateRangePicker
          value={preset === 'custom' ? range : null}
          placeholder="Custom"
          variant="ghost"
          onChange={(r) => (r ? onChange('custom', r) : onChange('month', presetRange('month')))}
          className={cn(TAB, 'gap-1.5 hover:bg-transparent', preset === 'custom' ? TAB_ON : TAB_OFF)}
        />
      </div>
      <span className="sr-only">{rangeLabel(range)}</span>
    </div>
  )
}
