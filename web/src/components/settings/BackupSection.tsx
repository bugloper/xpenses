import { Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Panel } from '@/components/common/kit'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { api, downloadFile, errorMessage } from '@/lib/api'

export function BackupSection({ id }: { id?: string }) {
  const qc = useQueryClient()
  const [passphrase, setPassphrase] = useState('')
  const [restorePass, setRestorePass] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState<'download' | 'restore' | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const download = async () => {
    setBusy('download')
    try {
      const name = await downloadFile(
        '/backup',
        'xpenses-backup.db',
        passphrase ? { 'X-Backup-Passphrase': passphrase } : undefined,
      )
      toast.success(`Backup downloaded (${name})`)
    } catch (e) {
      toast.error(errorMessage(e, 'Backup failed'))
    } finally {
      setBusy(null)
    }
  }

  const restore = async () => {
    if (!file) return
    setBusy('restore')
    try {
      const form = new FormData()
      form.append('file', file)
      if (restorePass) form.append('passphrase', restorePass)
      await api.postForm<{ status: string }>('/restore', form)
      toast.success('Backup restored')
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      await qc.invalidateQueries()
    } catch (e) {
      toast.error(errorMessage(e, 'Restore failed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel
      id={id}
      eyebrow="Administrator"
      title="Backup & restore"
      description="The whole instance in one file: every user, account and transaction."
      flush
    >
      <div className="divide-rule grid max-md:divide-y md:grid-cols-2 md:divide-x">
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <h3 className="eyebrow text-foreground/80">Download backup</h3>
          <Field>
            <FieldLabel htmlFor="backup-pass">Passphrase (optional)</FieldLabel>
            <Input
              id="backup-pass"
              type="password"
              autoComplete="new-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <FieldDescription>With a passphrase the file is AES-256-GCM encrypted (.enc).</FieldDescription>
          </Field>
          <Button onClick={() => void download()} disabled={busy !== null} className="w-fit">
            <Download data-icon="inline-start" /> {busy === 'download' ? 'Preparing…' : 'Download'}
          </Button>
        </div>
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <h3 className="eyebrow text-foreground/80">Restore backup</h3>
          <Field>
            <FieldLabel htmlFor="restore-file">Backup file</FieldLabel>
            <Input
              id="restore-file"
              ref={fileInput}
              type="file"
              accept=".db,.enc,.sqlite"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="restore-pass">Passphrase (if encrypted)</FieldLabel>
            <Input
              id="restore-pass"
              type="password"
              autoComplete="off"
              value={restorePass}
              onChange={(e) => setRestorePass(e.target.value)}
            />
          </Field>
          <Button
            variant="destructive"
            onClick={() => setConfirm(true)}
            disabled={!file || busy !== null}
            className="w-fit"
          >
            <Upload data-icon="inline-start" /> {busy === 'restore' ? 'Restoring…' : 'Restore'}
          </Button>
        </div>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title="Replace all data with this backup?"
          description={`Everything currently in Xpenses will be overwritten by "${file?.name ?? ''}". This cannot be undone.`}
          confirmLabel="Restore"
          destructive
          loading={busy === 'restore'}
          onConfirm={restore}
        />
      </div>
    </Panel>
  )
}
