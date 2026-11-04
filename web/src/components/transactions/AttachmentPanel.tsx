import { ImagePlus, ScanLine, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { toast } from 'sonner'
import { Panel } from '@/components/common/kit'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/api'
import { attachmentProblem, attachmentUrl, useRemoveAttachment, useUploadAttachment } from '@/lib/attachments'
import { useReceiptCapabilities, useScanAttachment } from '@/lib/receipts'
import type { Transaction } from '@/types/api'
import { ReceiptDetails } from './ReceiptCard'

/** The screenshot stored with a transaction, with attach / replace / remove. */
export function AttachmentPanel({ tx }: { tx: Transaction }) {
  const upload = useUploadAttachment()
  const remove = useRemoveAttachment()
  const scan = useScanAttachment()
  const caps = useReceiptCapabilities()
  const input = useRef<HTMLInputElement>(null)
  const busy = upload.isPending || remove.isPending || scan.isPending
  // Bust the browser cache after a replacement.
  const src = `${attachmentUrl(tx.id)}?v=${encodeURIComponent(tx.updated_at)}`

  const pick = (file: File | undefined) => {
    if (!file) return
    const problem = attachmentProblem(file)
    if (problem) {
      toast.error(problem)
      return
    }
    upload.mutate(
      { id: tx.id, file },
      { onSuccess: () => toast.success('Screenshot attached'), onError: (e) => toast.error(errorMessage(e)) },
    )
  }

  return (
    <Panel
      title="Screenshot"
      action={
        <div className="flex gap-1">
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
          <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            <ImagePlus data-icon="inline-start" /> {tx.has_attachment ? 'Replace' : 'Attach'}
          </Button>
          {tx.has_attachment && (
            <Button
              variant="ghost"
              size="sm"
              className="text-expense"
              disabled={busy}
              onClick={() =>
                remove.mutate(tx.id, {
                  onSuccess: () => toast.success('Screenshot removed'),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              <Trash2 data-icon="inline-start" /> Remove
            </Button>
          )}
        </div>
      }
    >
      {tx.has_attachment ? (
        <div className="flex flex-col gap-4">
          <a href={src} target="_blank" rel="noreferrer" className="block" aria-label="Open the screenshot">
            <img
              src={src}
              alt="Payment screenshot"
              className="bg-muted mx-auto max-h-96 rounded-xl object-contain"
            />
          </a>
          {tx.receipt && <ReceiptDetails receipt={tx.receipt} />}
          {caps.data?.ocr && (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={busy}
              onClick={() =>
                scan.mutate(tx.id, {
                  onSuccess: (r) =>
                    r.recognised
                      ? toast.success('Payment details read')
                      : toast.info('No payment details recognised'),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              <ScanLine data-icon="inline-start" /> {tx.receipt ? 'Read again' : 'Read payment details'}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No screenshot. Share one from your banking app into Xpensiv, or attach it here.
        </p>
      )}
    </Panel>
  )
}
