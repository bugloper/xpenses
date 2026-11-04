import { zodResolver } from '@hookform/resolvers/zod'
import { Check } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { Segmented } from '@/components/common/Segmented'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/api'
import { COLOR_PALETTE, ICON_NAMES, iconFor } from '@/lib/icons'
import { useCreateCategory, useUpdateCategory } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { Category, CategoryType } from '@/types/api'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  type: z.enum(['expense', 'income']),
  icon: z.string().min(1, 'Pick an icon'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour'),
})
type Values = z.infer<typeof schema>

export function CategoryFormSheet({
  open,
  onOpenChange,
  category,
  defaultType = 'expense',
  lockType = false,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  category?: Category | null
  defaultType?: CategoryType
  /** Hide the type switch: the caller already knows which kind it needs. */
  lockType?: boolean
  /** Called with the new category after a successful create. */
  onCreated?: (category: Category) => void
}) {
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', type: defaultType, icon: 'circle-dashed', color: COLOR_PALETTE[0]! },
  })
  const { control, handleSubmit, reset, formState, watch } = form
  useEffect(() => {
    if (!open) return
    reset(
      category
        ? { name: category.name, type: category.type, icon: category.icon, color: category.color }
        : { name: '', type: defaultType, icon: 'circle-dashed', color: COLOR_PALETTE[0]! },
    )
  }, [open, category, defaultType, reset])
  const busy = create.isPending || update.isPending
  const err = formState.errors
  const icon = watch('icon')
  const color = watch('color')
  const name = watch('name')

  const submit = handleSubmit(async (v) => {
    try {
      if (category) {
        await update.mutateAsync({ id: category.id, name: v.name, icon: v.icon, color: v.color })
        toast.success('Category updated')
      } else {
        const created = await create.mutateAsync(v)
        toast.success('Category created')
        onCreated?.(created)
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  })

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={category ? 'Edit category' : 'New category'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button form="category-form" type="submit" disabled={busy}>
            {busy ? 'Saving…' : category ? 'Save changes' : 'Create'}
          </Button>
        </div>
      }
    >
      <form id="category-form" className="flex flex-col gap-5" onSubmit={(e) => {
          e.stopPropagation()
          void submit(e)
        }}
        noValidate
      >
        <div className="bg-muted/50 flex items-center gap-3 rounded-xl p-3">
          <CategoryIcon icon={icon} color={color} size="lg" />
          <div>
            <p className="font-medium">{name || 'Preview'}</p>
            <p className="text-muted-foreground text-xs capitalize">{watch('type')}</p>
          </div>
        </div>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Field data-invalid={!!err.name}>
              <FieldLabel htmlFor="cat-name">Name</FieldLabel>
              <Input id="cat-name" autoFocus {...field} />
              <FieldError errors={[err.name]} />
            </Field>
          )}
        />
        {!category && !lockType && (
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Field>
                <FieldLabel>Type</FieldLabel>
                <Segmented
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: 'expense', label: 'Expense', tone: 'expense' },
                    { value: 'income', label: 'Income', tone: 'income' },
                  ]}
                />
              </Field>
            )}
          />
        )}
        <Controller
          control={control}
          name="color"
          render={({ field }) => (
            <Field data-invalid={!!err.color}>
              <FieldLabel>Colour</FieldLabel>
              <div className="grid grid-cols-9 gap-2" role="radiogroup" aria-label="Colour">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={field.value === c}
                    aria-label={c}
                    onClick={() => field.onChange(c)}
                    className="ring-offset-card aria-checked:ring-foreground flex aspect-square items-center justify-center rounded-full ring-offset-2 transition-transform hover:scale-110 aria-checked:ring-2"
                    style={{ backgroundColor: c }}
                  >
                    {field.value === c && <Check className="size-4 text-white" />}
                  </button>
                ))}
              </div>
              <FieldError errors={[err.color]} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="icon"
          render={({ field }) => (
            <Field data-invalid={!!err.icon}>
              <FieldLabel>Icon</FieldLabel>
              <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-8" role="radiogroup" aria-label="Icon">
                {ICON_NAMES.map((n) => {
                  const Icon = iconFor(n)
                  const active = field.value === n
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={n}
                      onClick={() => field.onChange(n)}
                      className={cn(
                        'flex aspect-square items-center justify-center rounded-lg transition-colors',
                        active
                          ? 'bg-primary/15 text-primary ring-primary ring-2'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4.5" />
                    </button>
                  )
                })}
              </div>
              <FieldError errors={[err.icon]} />
            </Field>
          )}
        />
      </form>
    </ResponsiveSheet>
  )
}
