import { Coins } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { errorMessage } from '@/lib/api'
import { useDefaultCurrency, useUpdateSettings } from '@/lib/queries'
import { cn } from '@/lib/utils'

/** The default currency, shown in the top bar and changed from there. */
export function CurrencyMenu({ className }: { className?: string }) {
  const current = useDefaultCurrency()
  const update = useUpdateSettings()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(current)
  const next = draft.trim().toUpperCase()
  const valid = /^[A-Z]{3}$/.test(next)
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setDraft(current)
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Default currency ${current}. Change`}
          className={cn(
            'text-ink-foreground/85 hover:bg-ink-foreground/10 hover:text-ink-foreground border-ink-foreground/20 inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 font-mono text-xs font-medium tracking-wider transition-colors',
            className,
          )}
        >
          <Coins className="size-3.5 opacity-70" />
          {current}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid) return
            update.mutate(
              { default_currency: next },
              {
                onSuccess: () => {
                  toast.success(`Currency set to ${next}`)
                  setOpen(false)
                },
                onError: (err) => toast.error(errorMessage(err)),
              },
            )
          }}
        >
          <div>
            <label htmlFor="currency-code" className="text-sm font-medium">
              Default currency
            </label>
            <p className="text-muted-foreground text-xs">3-letter code for new accounts and amounts.</p>
          </div>
          <div className="flex gap-2">
            <Input
              id="currency-code"
              maxLength={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="uppercase"
              autoComplete="off"
            />
            <Button type="submit" disabled={!valid || next === current || update.isPending}>
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
