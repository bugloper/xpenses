import { Download, FileText, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { downloadFile, errorMessage } from '@/lib/api'
import { exportFileName, exportPath, type ExportParams } from '@/lib/reports'
import type { ExportFormat, ExportReport } from '@/types/api'

/** CSV / PDF download buttons for GET /reports/export with the current tab's params. */
export function ExportButtons({
  report,
  params,
  disabled,
}: {
  report: ExportReport
  params: ExportParams
  disabled?: boolean
}) {
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const run = async (format: ExportFormat) => {
    setBusy(format)
    try {
      const name = await downloadFile(
        exportPath(report, format, params),
        exportFileName(report, format, params),
      )
      toast.success(`Downloaded ${name}`)
    } catch (e) {
      toast.error(errorMessage(e, 'Export failed'))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Export this report">
      <span className="eyebrow hidden sm:inline">Export</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || busy !== null}
        onClick={() => void run('csv')}
        aria-label="Export CSV"
      >
        {busy === 'csv' ? (
          <Loader2 data-icon="inline-start" className="animate-spin" />
        ) : (
          <Download data-icon="inline-start" />
        )}
        CSV
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || busy !== null}
        onClick={() => void run('pdf')}
        aria-label="Export PDF"
      >
        {busy === 'pdf' ? (
          <Loader2 data-icon="inline-start" className="animate-spin" />
        ) : (
          <FileText data-icon="inline-start" />
        )}
        PDF
      </Button>
    </div>
  )
}
