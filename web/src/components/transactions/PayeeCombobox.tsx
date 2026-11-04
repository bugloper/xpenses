import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { Payee } from '@/types/api'

/**
 * Payee picker: a searchable dropdown of the payees the user has saved
 * before. Typing a name that is not in the list offers to use it as a new
 * payee, so the list grows from the user's own entries.
 */
export function PayeeCombobox({
  id,
  value,
  onChange,
  onPick,
  payees,
  invalid,
  placeholder = 'Where / who',
}: {
  id?: string
  value: string
  onChange: (name: string) => void
  /** Called with the saved payee when one is chosen from the list. */
  onPick?: (payee: Payee) => void
  payees: Payee[]
  invalid?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const trimmed = query.trim()
  const matches = useMemo(() => {
    const q = trimmed.toLowerCase()
    return q ? payees.filter((p) => p.name.toLowerCase().includes(q)) : payees
  }, [payees, trimmed])
  const exact = trimmed !== '' && payees.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())

  const choose = (name: string, payee?: Payee) => {
    onChange(name)
    if (payee) onPick?.(payee)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className={cn(
            'h-9 w-full justify-between rounded-xl font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false} label="Payee name">
          <CommandInput
            autoFocus
            placeholder="Search or type a new payee"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {trimmed !== '' && !exact && (
              <CommandItem value={`__use__${trimmed}`} onSelect={() => choose(trimmed)}>
                <Plus className="text-primary" />
                <span>Use &ldquo;{trimmed}&rdquo;</span>
              </CommandItem>
            )}
            {matches.map((p) => (
              <CommandItem
                key={p.name}
                value={p.name}
                data-checked={p.name === value}
                onSelect={() => choose(p.name, p)}
              >
                <span className="truncate">{p.name}</span>
                {p.name === value && <Check className="ml-auto size-4" />}
              </CommandItem>
            ))}
            {value && (
              <CommandItem value="__clear__" onSelect={() => choose('')} className="text-muted-foreground">
                <X /> Clear payee
              </CommandItem>
            )}
            {matches.length === 0 && trimmed === '' && (
              <CommandEmpty>
                {payees.length === 0 ? 'No payees yet. Type a name to add one.' : 'No matching payee.'}
              </CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
