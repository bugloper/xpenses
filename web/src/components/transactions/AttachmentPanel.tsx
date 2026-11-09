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

/**
 * The payment screenshot kept with a transaction, beside the record: the image
 * on a mat, what it said underneath, and attach / replace / read / remove.
 */
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
      eyebrow="Attachment"
      flush
      action={
        <>
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
        </>
      }
      footer={
        tx.has_attachment ? (
          <div className="flex flex-wrap items-center gap-2">
            {caps.data?.ocr && (
              <Button
                variant="outline"
                size="sm"
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
                <ScanLine data-icon="inline-start" className={scan.isPending ? 'animate-pulse' : ''} />{' '}
                {tx.receipt ? 'Read again' : 'Read payment details'}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive ml-auto"
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
          </div>
        ) : undefined
      }
    >
      {tx.has_attachment ? (
        <div>
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="bg-muted/60 block border-b p-4 sm:p-5"
            aria-label="Open the screenshot"
          >
            <img
              src={src}
              alt="Payment screenshot"
              className="mx-auto max-h-[28rem] rounded-sm border object-contain shadow-[0_1px_3px_rgb(0_0_0/0.08)]"
            />
          </a>
          {tx.receipt ? (
            <div className="px-4 py-1 sm:px-5">
              <div className="eyebrow pt-3 pb-1">What the screenshot says</div>
              <ReceiptDetails receipt={tx.receipt} />
            </div>
          ) : (
            <p className="text-muted-foreground px-4 py-3 text-sm sm:px-5">No payment details read yet.</p>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="hover:bg-muted/40 m-4 flex w-[calc(100%-2rem)] flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center transition-colors sm:m-5 sm:w-[calc(100%-2.5rem)]"
        >
          <ImagePlus className="text-muted-foreground size-5" />
          <span className="text-muted-foreground max-w-xs text-sm">
            No screenshot. Share one from your banking app into Xpenses, or attach it here.
          </span>
        </button>
      )}
    </Panel>
  )
}
