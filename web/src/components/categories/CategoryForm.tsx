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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { groupCategories } from '@/lib/categories'
import { useCategories, useCreateCategory, useUpdateCategory } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { Category, CategoryType } from '@/types/api'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  type: z.enum(['expense', 'income']),
  icon: z.string().min(1, 'Pick an icon'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour'),
  parent_id: z.string().optional(),
})
type Values = z.infer<typeof schema>

export function CategoryFormSheet({
  open,
  onOpenChange,
  category,
  defaultType = 'expense',
  lockType = false,
  defaultParentId = null,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  category?: Category | null
  defaultType?: CategoryType
  /** Hide the type switch: the caller already knows which kind it needs. */
  lockType?: boolean
  /** Pre-selects the main category a new sub-category goes under. */
  defaultParentId?: string | null
  /** Called with the new category after a successful create. */
  onCreated?: (category: Category) => void
}) {
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const { data: all = [] } = useCategories(true)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      type: defaultType,
      icon: 'circle-dashed',
      color: COLOR_PALETTE[0]!,
      parent_id: '',
    },
  })
  const { control, handleSubmit, reset, formState, watch, setValue } = form
  useEffect(() => {
    if (!open) return
    const parent = defaultParentId ? all.find((c) => c.id === defaultParentId) : undefined
    reset(
      category
        ? {
            name: category.name,
            type: category.type,
            icon: category.icon,
            color: category.color,
            parent_id: category.parent_id ?? '',
          }
        : {
            name: '',
            type: defaultType,
            icon: 'circle-dashed',
            color: parent?.color ?? COLOR_PALETTE[0]!,
            parent_id: defaultParentId ?? '',
          },
    )
  }, [open, category, defaultType, defaultParentId, reset, all])
  const type = watch('type')
  const parentId = watch('parent_id')
  // Main categories of the same type that could be the parent (never itself or its own children).
  const parents = groupCategories(all, type, { includeInactive: false })
    .map((g) => g.parent)
    .filter((p) => !category || (p.id !== category.id && p.parent_id !== category.id))
  const busy = create.isPending || update.isPending
  const err = formState.errors
  const icon = watch('icon')
  const color = watch('color')
  const name = watch('name')

  const submit = handleSubmit(async (v) => {
    try {
      if (category) {
        await update.mutateAsync({
          id: category.id,
          name: v.name,
          icon: v.icon,
          color: v.color,
          parent_id: v.parent_id ?? '',
        })
        toast.success('Category updated')
      } else {
        const created = await create.mutateAsync({ ...v, parent_id: v.parent_id || null })
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
      <form
        id="category-form"
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.stopPropagation()
          void submit(e)
        }}
        noValidate
      >
        <div className="bg-muted/40 flex items-center gap-3 rounded-md border border-dashed p-3">
          <CategoryIcon icon={icon} color={color} size="lg" />
          <div className="min-w-0">
            <p className="eyebrow">
              {watch('type')} ·{' '}
              {parentId
                ? `under ${parents.find((p) => p.id === parentId)?.name ?? 'a main category'}`
                : 'main category'}
            </p>
            <p className="font-display mt-1 truncate text-xl leading-tight">{name || 'Preview'}</p>
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
          name="parent_id"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="cat-parent">Main category</FieldLabel>
              <Select
                value={field.value || '__none__'}
                onValueChange={(v) => {
                  field.onChange(v === '__none__' ? '' : v)
                  const p = parents.find((x) => x.id === v)
                  if (p && !category) setValue('color', p.color)
                }}
              >
                <SelectTrigger id="cat-parent" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None — this is a main category</SelectItem>
                  {parents.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {parentId
                  ? 'A sub-category: it is filed under the main category above.'
                  : 'Main categories group sub-categories in the picker and reports.'}
              </p>
            </Field>
          )}
        />
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
                    className="ring-offset-card aria-checked:ring-foreground flex aspect-square items-center justify-center rounded-sm ring-offset-2 transition-shadow aria-checked:ring-2"
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
                        'flex aspect-square items-center justify-center rounded-md border transition-colors',
                        active
                          ? 'border-foreground bg-card text-foreground shadow-[inset_0_0_0_1px_var(--foreground)]'
                          : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground border-transparent',
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
