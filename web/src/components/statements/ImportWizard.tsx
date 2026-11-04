import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Money } from '@/components/common/Money'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { errorMessage, isApiError } from '@/lib/api'
import { rangeLabel } from '@/lib/dates'
import { useAccounts, useDefaultCurrency, useImportStatement, useParseStatement } from '@/lib/queries'
import { previewTotals, recomputeValidation, toEditableRows, toImportRows } from '@/lib/statements'
import { cn } from '@/lib/utils'
import type { ImportPreview } from '@/types/api'
import { PreviewStep, ValidationBanner, type PreviewState } from './PreviewStep'
import { statementAccounts, UploadStep, type UploadValues } from './UploadStep'

type Step = 1 | 2 | 3
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Upload' },
  { n: 2, label: 'Preview & correct' },
  { n: 3, label: 'Confirm' },
]

function Stepper({ step }: { step: Step }) {
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Import steps">
      {STEPS.map((s, i) => (
        <li key={s.n} className="flex items-center gap-2">
          <span
            aria-current={s.n === step ? 'step' : undefined}
            className={cn(
              'flex size-5 items-center justify-center rounded-full text-[11px] font-semibold',
              s.n < step && 'bg-primary text-primary-foreground',
              s.n === step && 'bg-primary/15 text-primary ring-primary ring-1',
              s.n > step && 'bg-muted text-muted-foreground',
            )}
          >
            {s.n < step ? <Check className="size-3" /> : s.n}
          </span>
          <span className={cn(s.n === step ? 'text-foreground font-medium' : 'text-muted-foreground', 'hidden sm:inline')}>
            {s.label}
          </span>
          {i < STEPS.length - 1 && <span className="bg-border h-px w-4 sm:w-6" />}
        </li>
      ))}
    </ol>
  )
}

/** Dialog on desktop (wide, for the table), bottom drawer on mobile. */
function Shell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: ReactNode
  description: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const desktop = useIsDesktop()
  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-5xl">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="border-t px-5 py-3">{footer}</div>}
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="bg-card max-h-[94dvh]">
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="safe-bottom border-t px-4 py-3">{footer}</div>}
      </DrawerContent>
    </Drawer>
  )
}

export function ImportWizard({
  open,
  onOpenChange,
  defaultAccountId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  defaultAccountId?: string
}) {
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title="Import statement"
      description="Upload a BOB PDF, check the parsed rows, then import."
    >
      {/* Keyed so each open starts from step 1 with no password left in memory. */}
      {open && <WizardBody key="wizard" defaultAccountId={defaultAccountId} onDone={() => onOpenChange(false)} />}
    </Shell>
  )
}

function WizardBody({ defaultAccountId, onDone }: { defaultAccountId?: string; onDone: () => void }) {
  const navigate = useNavigate()
  const { data: accounts = [] } = useAccounts()
  const currency = useDefaultCurrency()
  const parse = useParseStatement()
  const importStatement = useImportStatement()
  const [step, setStep] = useState<Step>(1)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [accountId, setAccountId] = useState(defaultAccountId ?? '')
  const [state, setState] = useState<PreviewState | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const onParsed = (p: ImportPreview, values: UploadValues) => {
    setPreview(p)
    setAccountId(values.account_id)
    setState({
      statement: p.statement,
      rows: toEditableRows(p.transactions),
      skipDuplicates: true,
      force: false,
    })
    setStep(2)
  }

  const doImport = async () => {
    if (!preview || !state) return
    setImportError(null)
    try {
      const res = await importStatement.mutateAsync({
        upload_token: preview.upload_token,
        account_id: accountId,
        force: state.force,
        skip_duplicates: state.skipDuplicates,
        statement: state.statement,
        transactions: toImportRows(state.rows),
      })
      toast.success(`Imported ${res.transaction_count} transaction${res.transaction_count === 1 ? '' : 's'}`, {
        description:
          res.skipped_duplicates > 0
            ? `${res.skipped_duplicates} duplicate${res.skipped_duplicates === 1 ? '' : 's'} skipped.`
            : undefined,
      })
      onDone()
      void navigate({
        to: '/reconciliation/$statementId',
        params: { statementId: res.id },
        search: { prompt: 'auto-match' },
      })
    } catch (e) {
      if (isApiError(e) && e.code === 'duplicate_statement') {
        setImportError('This file was already imported. Go back to the preview and choose "Import anyway" to force it.')
      } else if (isApiError(e) && e.code === 'duplicate_bank_transaction') {
        setImportError('Some rows already exist for this account. Go back and turn "Skip duplicates" on.')
      } else if (isApiError(e) && e.status === 400 && /upload token/i.test(e.message)) {
        setImportError('The upload expired (30 minutes). Start again and re-upload the PDF.')
      } else {
        setImportError(errorMessage(e, 'Import failed'))
      }
    }
  }

  const currencyForPreview = state?.statement.currency || currency
  const eligible = statementAccounts(accounts)

  return (
    <div className="flex flex-col gap-5">
      <Stepper step={step} />
      {step === 1 && (
        <UploadStep
          accounts={eligible}
          defaultAccountId={accountId || undefined}
          parse={(values) => parse.mutateAsync(values)}
          onParsed={onParsed}
        />
      )}
      {step === 2 && preview && state && (
        <>
          <PreviewStep
            value={state}
            onChange={setState}
            duplicate={preview.duplicate_statement}
            parseWarnings={preview.warnings}
            textExtraction={preview.text_extraction}
            currency={currencyForPreview}
          />
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft data-icon="inline-start" /> Back
            </Button>
            <Button
              type="button"
              onClick={() => setStep(3)}
              disabled={state.rows.length === 0 || (!!preview.duplicate_statement && preview.duplicate_statement.reason === 'sha256' && !state.force)}
            >
              Continue
            </Button>
          </div>
        </>
      )}
      {step === 3 && preview && state && (
        <ConfirmStep
          preview={preview}
          state={state}
          currency={currencyForPreview}
          accountName={accounts.find((a) => a.id === accountId)?.name ?? 'Account'}
          busy={importStatement.isPending}
          error={importError}
          onBack={() => setStep(2)}
          onImport={() => void doImport()}
        />
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

function ConfirmStep({
  preview,
  state,
  currency,
  accountName,
  busy,
  error,
  onBack,
  onImport,
}: {
  preview: ImportPreview
  state: PreviewState
  currency: string
  accountName: string
  busy: boolean
  error: string | null
  onBack: () => void
  onImport: () => void
}) {
  const totals = previewTotals(state.rows)
  const validation = recomputeValidation(state.statement, state.rows)
  const willImport = state.skipDuplicates ? totals.count - totals.duplicates : totals.count
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-muted/40 divide-y rounded-2xl px-4">
        <Row label="File" value={preview.file_name} />
        <Row label="Account" value={accountName} />
        <Row label="Period" value={rangeLabel({ from: state.statement.period_start, to: state.statement.period_end })} />
        <Row label="Rows to import" value={willImport} />
        {totals.duplicates > 0 && (
          <Row label="Duplicates" value={state.skipDuplicates ? `${totals.duplicates} skipped` : `${totals.duplicates} kept`} />
        )}
        <Row label="Debits" value={<Money minor={-totals.debits} currency={currency} tone="expense" />} />
        <Row label="Credits" value={<Money minor={totals.credits} currency={currency} tone="income" sign="always" />} />
        {state.force && <Row label="Duplicate statement" value="Importing anyway" />}
      </div>
      <ValidationBanner validation={validation} currency={currency} />
      {willImport === 0 && (
        <p className="text-muted-foreground text-sm">
          Nothing to import: every row already exists for this account{totals.duplicates > 0 ? ' and duplicates are skipped' : ''}.
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowLeft data-icon="inline-start" /> Back
        </Button>
        <Button type="button" onClick={onImport} disabled={busy || willImport === 0}>
          {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Check data-icon="inline-start" />}
          {busy ? 'Importing…' : `Import ${willImport} row${willImport === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  )
}
