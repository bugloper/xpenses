import { Camera, ImagePlus, Paperclip, X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { attachmentProblem } from '@/lib/attachments'
import { cn } from '@/lib/utils'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * The screenshot that goes with a transaction: a thumbnail when one is
 * attached (shared from a banking app, or picked here), else a card inviting
 * one, with the camera on phones. `compact` keeps the card to one line.
 */
export function AttachmentField({
  file,
  onChange,
  compact,
}: {
  file: File | null
  onChange: (file: File | null) => void
  compact?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const pick = (f: File | undefined) => {
    if (!f) return
    const problem = attachmentProblem(f)
    if (problem) {
      toast.error(problem)
      return
    }
    onChange(f)
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Attach screenshot"
        tabIndex={-1}
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {file && preview ? (
        <div className="bg-muted/50 flex items-center gap-3 rounded-xl border p-2" data-testid="attachment">
          <img src={preview} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium">
              <Paperclip className="text-muted-foreground size-3.5 shrink-0" /> Screenshot attached
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {file.name || 'screenshot'} · {formatSize(file.size)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove screenshot"
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            'border-primary/30 bg-primary/5 flex gap-3 rounded-xl border border-dashed',
            compact ? 'items-center px-3 py-2.5' : 'flex-col p-4 sm:flex-row sm:items-center',
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Add the payment screenshot</p>
            <p className="text-muted-foreground text-xs">
              mBoB, mPay or any app. The amount, date and reference are filled in for you.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {/* The camera input only means something on a phone; desktops get the picker. */}
            <input
              ref={camera}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label="Take a photo of the receipt"
              tabIndex={-1}
              onChange={(e) => {
                pick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <Button type="button" variant="outline" size="sm" className="sm:hidden" onClick={() => camera.current?.click()}>
              <Camera data-icon="inline-start" /> Camera
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
              <ImagePlus data-icon="inline-start" /> Choose image
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
