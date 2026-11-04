import { ImagePlus, Paperclip, X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { attachmentProblem } from '@/lib/attachments'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * The screenshot that goes with a transaction: a thumbnail when one is
 * attached (shared from a banking app, or picked here), else a button to pick one.
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
        <Button
          type="button"
          variant="outline"
          size={compact ? 'sm' : 'default'}
          onClick={() => input.current?.click()}
        >
          <ImagePlus data-icon="inline-start" /> Attach screenshot
        </Button>
      )}
    </div>
  )
}
