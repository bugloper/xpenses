import { createRoute } from '@tanstack/react-router'
import { CloudUpload, Download as InstallIcon } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Section } from '@/components/common/PageHeader'
import { Segmented } from '@/components/common/Segmented'
import { useTheme } from '@/components/layout/ThemeProvider'
import { PasswordSection, ProfileSection } from '@/components/settings/AccountSection'
import { BackupSection } from '@/components/settings/BackupSection'
import { RecurringSection } from '@/components/settings/RecurringSection'
import { SessionsSection } from '@/components/settings/SessionsSection'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { relativeTime } from '@/lib/dates'
import { syncManager, useSyncState } from '@/lib/offline'
import { usePwaInstall } from '@/lib/pwa-install'
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
    return <p className="text-muted-foreground text-sm">Xpenses is installed on this device.</p>
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-sm">
        {pwa.canInstall
          ? 'Add Xpenses to your home screen for quick access.'
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Your profile, security and how the app behaves. The default currency is in the top bar."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Profile">
          <ProfileSection />
        </Section>
        <Section title="Password">
          <PasswordSection />
        </Section>
        <Section title="Devices signed in">
          <SessionsSection />
        </Section>
        <div className="flex flex-col gap-6">
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
            </div>
          </Section>
          <Section title="Offline">
            <OfflineRow />
          </Section>
          <Section title="App">
            <div className="bg-card border flex flex-col gap-3 rounded-[1.25rem] p-4">
              <InstallRow />
              <p className="text-muted-foreground text-xs">Xpenses web {version}</p>
            </div>
          </Section>
        </div>
        <Section title="Recurring" className="lg:col-span-2">
          <RecurringSection />
        </Section>
        {isAdmin && (
          <Section title="Backup & restore" className="lg:col-span-2">
            <BackupSection />
          </Section>
        )}
      </div>
    </div>
  )
}

export const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: SettingsPage,
})
