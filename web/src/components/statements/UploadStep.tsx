import { Eye, EyeOff, FileText, Loader2, Upload, X } from 'lucide-react'
import { useId, useRef, useState, type DragEvent } from 'react'
import { AccountIcon } from '@/components/common/AccountIcon'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { isApiError } from '@/lib/api'
import { formatBytes, MAX_UPLOAD_BYTES, uploadErrorInfo, validateStatementFile, type UploadErrorInfo } from '@/lib/statements'
import { cn } from '@/lib/utils'
import type { Account, ImportPreview } from '@/types/api'

export type UploadValues = { file: File; account_id: string; password: string }

/** Accounts a bank statement can belong to. */
export function statementAccounts(accounts: Account[]): Account[] {
  return accounts.filter((a) => a.is_active && (a.type === 'bank' || a.type === 'savings' || a.type === 'credit_card'))
}

export function UploadStep({
  accounts,
  defaultAccountId,
  parse,
  onParsed,
  formId = 'statement-upload',
}: {
  accounts: Account[]
  defaultAccountId?: string
  /** Performs POST /statements/parse; rejects with an ApiError on failure. */
  parse: (values: UploadValues) => Promise<ImportPreview>
  onParsed: (preview: ImportPreview, values: UploadValues) => void
  formId?: string
}) {
  const id = useId()
  const [accountId, setAccountId] = useState(defaultAccountId ?? (accounts.length === 1 ? accounts[0]!.id : ''))
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<UploadErrorInfo | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const pickFile = (f: File | null | undefined) => {
    setError(null)
    if (!f) return
    const problem = validateStatementFile(f)
    if (problem) {
      setFile(null)
      setError({ field: 'file', title: 'Choose a different file', description: problem })
      return
    }
    setFile(f)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    pickFile(e.dataTransfer.files?.[0])
  }

  const submit = async () => {
    setError(null)
    if (!accountId) {
      setError({ field: 'account', title: 'Select an account', description: 'Which account is this statement for?' })
      return
    }
    if (!file) {
      setError({ field: 'file', title: 'Choose a PDF', description: 'Pick the statement exported from BOB.' })
      return
    }
    setBusy(true)
    try {
      const values = { file, account_id: accountId, password }
      const preview = await parse(values)
      onParsed(preview, values)
    } catch (e) {
      if (isApiError(e)) {
        const detail = Object.values(e.details)[0]
        setError(uploadErrorInfo(e.code, detail ? `${detail}` : e.message))
      } else {
        setError(uploadErrorInfo('unknown', e instanceof Error ? e.message : undefined))
      }
    } finally {
      setBusy(false)
    }
  }

  const fieldError = (field: UploadErrorInfo['field']) =>
    error?.field === field ? (
      <FieldError role="alert" errors={[{ message: `${error.title}. ${error.description}` }]} />
    ) : null

  return (
    <form
      id={formId}
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Field data-invalid={error?.field === 'account' || undefined}>
        <FieldLabel htmlFor={`${id}-account`}>Account</FieldLabel>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger id={`${id}-account`} className="w-full" aria-invalid={error?.field === 'account' || undefined}>
            <SelectValue placeholder="Select the statement's account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                <AccountIcon type={a.type} size="sm" className="size-5 rounded-md [&>svg]:size-3" />
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {accounts.length === 0 && (
          <FieldDescription>Create a bank, savings or credit card account first.</FieldDescription>
        )}
        {fieldError('account')}
      </Field>

      <Field data-invalid={error?.field === 'file' || undefined}>
        <FieldLabel htmlFor={`${id}-file`}>Statement PDF</FieldLabel>
        <input
          ref={inputRef}
          id={`${id}-file`}
          type="file"
          accept=".pdf,application/pdf"
          className="sr-only"
          onChange={(e) => {
            pickFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {file ? (
          <div className="bg-muted/50 flex items-center gap-3 rounded-xl border px-3 py-2.5">
            <FileText className="text-primary size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-muted-foreground text-xs">{formatBytes(file.size)}</p>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove file" onClick={() => setFile(null)}>
              <X />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-input hover:bg-muted/50',
              error?.field === 'file' && 'border-destructive/60',
            )}
          >
            <Upload className="text-muted-foreground size-5" />
            <span className="text-sm font-medium">Choose a PDF or drop it here</span>
            <span className="text-muted-foreground text-xs">BOB statement export · up to {formatBytes(MAX_UPLOAD_BYTES)}</span>
          </button>
        )}
        {fieldError('file')}
      </Field>

      <Field data-invalid={error?.field === 'password' || undefined}>
        <FieldLabel htmlFor={`${id}-password`}>PDF password</FieldLabel>
        <div className="relative">
          <Input
            id={`${id}-password`}
            type={showPassword ? 'text' : 'password'}
            inputMode="numeric"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="DDMM"
            maxLength={32}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error?.field === 'password') setError(null)
            }}
            aria-invalid={error?.field === 'password' || undefined}
            aria-describedby={`${id}-password-hint`}
            className="pr-10"
          />
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <FieldDescription id={`${id}-password-hint`}>
          <strong>DDMM of your DOB</strong> (for example 0101 for 1 January). BOB protects statements with this.
          The password is sent once with this upload only and is never stored.
        </FieldDescription>
        {fieldError('password')}
      </Field>

      {error?.field === 'form' && (
        <Alert variant="destructive">
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription>{error.description}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" size="lg" className="h-11 rounded-xl" disabled={busy || accounts.length === 0}>
        {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Upload data-icon="inline-start" />}
        {busy ? 'Reading statement…' : 'Parse statement'}
      </Button>
    </form>
  )
}
