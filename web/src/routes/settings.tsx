import { createRoute } from '@tanstack/react-router'
import { CloudUpload, Download as InstallIcon, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Section } from '@/components/common/PageHeader'
import { PageHeader } from '@/components/common/PageHeader'
import { Segmented } from '@/components/common/Segmented'
import { ErrorState } from '@/components/common/States'
import { useTheme } from '@/components/layout/ThemeProvider'
import { AccountSection } from '@/components/settings/AccountSection'
import { BackupSection } from '@/components/settings/BackupSection'
import { RecurringSection } from '@/components/settings/RecurringSection'
import { SessionsSection } from '@/components/settings/SessionsSection'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { relativeTime } from '@/lib/dates'
import { syncManager, useSyncState } from '@/lib/offline'
import { usePwaInstall } from '@/lib/pwa-install'
import { useSettings, useUpdateSettings } from '@/lib/queries'
import { uiStore } from '@/lib/ui-store'
import { appRoute } from './__root'

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
  if (isPending) return <Skeleton className="h-32 w-full rounded-[1.25rem]" />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} compact />
  // Keyed on the server values so the local drafts reset whenever they change.
  const cur = data.default_currency ?? 'BTN'
  return <GeneralSettingsForm key={cur} currency={cur} />
}

function GeneralSettingsForm({ currency: initialCurrency }: { currency: string }) {
  const update = useUpdateSettings()
  const [currency, setCurrency] = useState(initialCurrency)
  const save = (patch: Record<string, string>) =>
    update.mutate(patch, {
      onSuccess: () => toast.success('Saved'),
      onError: (e) => toast.error(errorMessage(e)),
    })
  return (
    <div className="bg-card border divide-y rounded-[1.25rem] px-4">
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
    <div className="bg-card border flex flex-col gap-3 rounded-[1.25rem] p-4 sm:flex-row sm:items-center sm:justify-between">
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
  const { isAdmin } = useAuth()
  const version = __APP_VERSION__
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Settings" />
      <Section title="Account">
        <AccountSection />
      </Section>
      <Section title="Sessions">
        <SessionsSection />
      </Section>
      <Section title="Appearance">
        <div className="bg-card border rounded-[1.25rem] px-4">
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
      {isAdmin && (
        <Section title="Backup & restore">
          <BackupSection />
        </Section>
      )}
      <Section title="Offline">
        <OfflineRow />
      </Section>
      <Section title="App">
        <div className="bg-card border flex flex-col gap-3 rounded-[1.25rem] p-4">
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
  getParentRoute: () => appRoute,
  path: '/settings',
  component: SettingsPage,
})
