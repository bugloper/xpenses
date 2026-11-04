import { createRoute } from '@tanstack/react-router'
import { CloudUpload, Download as InstallIcon, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Section } from '@/components/common/PageHeader'
import { PageHeader } from '@/components/common/PageHeader'
import { Segmented } from '@/components/common/Segmented'
import { ErrorState } from '@/components/common/States'
import { useTheme } from '@/components/layout/ThemeProvider'
import { BackupSection } from '@/components/settings/BackupSection'
import { RecurringSection } from '@/components/settings/RecurringSection'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/api'
import { relativeTime } from '@/lib/dates'
import { syncManager, useSyncState } from '@/lib/offline'
import { usePwaInstall } from '@/lib/pwa-install'
import { useSettings, useUpdateSettings } from '@/lib/queries'
import { uiStore } from '@/lib/ui-store'
import { rootRoute } from './__root'

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
      <div className="sm:w-56">{children}</div>
    </div>
  )
}

function GeneralSettings() {
  const { data, isPending, error, refetch } = useSettings()
  if (isPending) return <Skeleton className="h-32 w-full rounded-2xl" />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} compact />
  // Keyed on the server values so the local drafts reset whenever they change.
  const tol = data['reconciliation.date_tolerance_days'] ?? '3'
  const cur = data.default_currency ?? 'BTN'
  return <GeneralSettingsForm key={`${tol}|${cur}`} tolerance={tol} currency={cur} />
}

function GeneralSettingsForm({
  tolerance: initialTolerance,
  currency: initialCurrency,
}: {
  tolerance: string
  currency: string
}) {
  const update = useUpdateSettings()
  const [tolerance, setTolerance] = useState(initialTolerance)
  const [currency, setCurrency] = useState(initialCurrency)
  const save = (patch: Record<string, string>) =>
    update.mutate(patch, {
      onSuccess: () => toast.success('Saved'),
      onError: (e) => toast.error(errorMessage(e)),
    })
  return (
    <div className="bg-card ring-foreground/10 divide-y rounded-2xl px-4 ring-1">
      <SettingRow
        label="Reconciliation date tolerance"
        description="Days a bank line may differ from a manual transaction (0–31)."
      >
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            save({ 'reconciliation.date_tolerance_days': tolerance })
          }}
        >
          <Input
            type="number"
            min={0}
            max={31}
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value)}
            aria-label="Date tolerance in days"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={update.isPending || tolerance === initialTolerance}
          >
            Save
          </Button>
        </form>
      </SettingRow>
      <SettingRow
        label="Default currency"
        description="3-letter code used for new accounts and the amount entry."
      >
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            save({ default_currency: currency.trim().toUpperCase() })
          }}
        >
          <Input
            maxLength={3}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            aria-label="Default currency"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={update.isPending || currency.trim().toUpperCase() === initialCurrency}
          >
            Save
          </Button>
        </form>
      </SettingRow>
    </div>
  )
}

function OfflineRow() {
  const s = useSyncState()
  return (
    <div className="bg-card ring-foreground/10 flex flex-col gap-3 rounded-2xl p-4 ring-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-xl">
          <CloudUpload className="size-5" />
        </span>
        <div>
          <p className="text-sm font-medium">
            {s.online ? 'Online' : 'Offline'}
            {s.syncing ? ' · syncing…' : ''}
          </p>
          <p className="text-muted-foreground text-xs">
            {s.pending} pending · {s.failed} failed
            {s.lastSyncAt ? ` · last attempt ${relativeTime(new Date(s.lastSyncAt).toISOString())}` : ''}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => uiStore.setPending(true)}>
          View queue
        </Button>
        <Button size="sm" disabled={s.syncing} onClick={() => void syncManager.syncNow({ force: true })}>
          Retry sync
        </Button>
      </div>
    </div>
  )
}

function InstallRow() {
  const pwa = usePwaInstall()
  if (pwa.standalone || pwa.installed)
    return <p className="text-muted-foreground text-sm">Xpensiv is installed on this device.</p>
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        {pwa.canInstall
          ? 'Add Xpensiv to your home screen for quick access.'
          : 'Use your browser menu → "Add to Home Screen" to install.'}
      </p>
      {pwa.canInstall && (
        <Button
          size="sm"
          onClick={() =>
            void pwa.install().then((r) => {
              if (r === 'accepted') toast.success('Installed')
            })
          }
        >
          <InstallIcon data-icon="inline-start" /> Install app
        </Button>
      )}
    </div>
  )
}

function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const version = __APP_VERSION__
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Settings" />
      <Section title="Appearance">
        <div className="bg-card ring-foreground/10 rounded-2xl px-4 ring-1">
          <SettingRow label="Theme">
            <Segmented
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </SettingRow>
          <p className="sr-only">{theme === 'dark' ? <Moon /> : <Sun />}</p>
        </div>
      </Section>
      <Section title="General">
        <GeneralSettings />
      </Section>
      <Section title="Recurring">
        <RecurringSection />
      </Section>
      <Section title="Backup & restore">
        <BackupSection />
      </Section>
      <Section title="Offline">
        <OfflineRow />
      </Section>
      <Section title="App">
        <div className="bg-card ring-foreground/10 flex flex-col gap-3 rounded-2xl p-4 ring-1">
          <InstallRow />
          <Field>
            <FieldLabel>Version</FieldLabel>
            <FieldDescription>Xpensiv web {version}</FieldDescription>
          </Field>
        </div>
      </Section>
    </div>
  )
}

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})
