import { createRoute } from '@tanstack/react-router'
import { CloudOff, CloudUpload, Download as InstallIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { Panel } from '@/components/common/kit'
import { PageHeader } from '@/components/common/PageHeader'
import { Segmented } from '@/components/common/Segmented'
import { useTheme } from '@/components/layout/ThemeProvider'
import { PasswordSection, ProfileSection } from '@/components/settings/AccountSection'
import { BackupSection } from '@/components/settings/BackupSection'
import { RecurringSection } from '@/components/settings/RecurringSection'
import { SessionsSection } from '@/components/settings/SessionsSection'
import { Button } from '@/components/ui/button'
import { accessDaysLeft, useAuth } from '@/lib/auth'
import { formatShortDate, relativeTime } from '@/lib/dates'
import { syncManager, useSyncState } from '@/lib/offline'
import { usePwaInstall } from '@/lib/pwa-install'
import { uiStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import { appRoute } from './__root'

/** A label and its explanation on the left, the control on the right. */
function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

/** How long the user may keep using the app. */
function AccessSection({ id }: { id: string }) {
  const { user } = useAuth()
  if (!user) return null
  const left = accessDaysLeft(user)
  return (
    <Panel id={id} title="Access" flush>
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-5">
        <div>
          <div className="eyebrow">{left === null ? 'Administrator' : 'Free year'}</div>
          <p className="figure mt-2 text-[1.75rem] leading-none">
            {left === null ? 'No end date' : formatShortDate(user.access_until)}
          </p>
        </div>
        <p
          className={cn(
            'text-muted-foreground text-sm sm:max-w-xs sm:text-right',
            left !== null && left < 0 && 'text-destructive',
            left !== null && left >= 0 && left <= 30 && 'text-warn',
          )}
        >
          {left === null
            ? 'Administrators are exempt from the free year.'
            : left < 0
              ? `Ended on ${formatShortDate(user.access_until)}.`
              : `Until ${formatShortDate(user.access_until)} · ${left === 0 ? 'last day' : `${left} day${left === 1 ? '' : 's'} left`}. The administrator can extend it.`}
        </p>
      </div>
    </Panel>
  )
}

function AppearanceSection({ id }: { id: string }) {
  const { theme, setTheme } = useTheme()
  return (
    <Panel id={id} title="Appearance" flush>
      <SettingRow label="Theme" description="Also on the moon and sun button in the top bar.">
        <Segmented
          aria-label="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </SettingRow>
    </Panel>
  )
}

/** Offline queue and the installed app, both about this device rather than the account. */
function DeviceSection({ id }: { id: string }) {
  const s = useSyncState()
  const pwa = usePwaInstall()
  const installed = pwa.standalone || pwa.installed
  return (
    <Panel
      id={id}
      title="This device"
      description="Saved entries waiting to sync, and the app on this device."
      flush
    >
      <div className="divide-rule divide-y">
        <SettingRow
          label={`${s.online ? 'Online' : 'Offline'}${s.syncing ? ' · syncing…' : ''}`}
          description={
            <>
              {s.pending} pending · {s.failed} failed
              {s.lastSyncAt ? ` · last attempt ${relativeTime(new Date(s.lastSyncAt).toISOString())}` : ''}
            </>
          }
        >
          <Button variant="outline" size="sm" onClick={() => uiStore.setPending(true)}>
            View queue
          </Button>
          <Button size="sm" disabled={s.syncing} onClick={() => void syncManager.syncNow({ force: true })}>
            {s.online ? <CloudUpload data-icon="inline-start" /> : <CloudOff data-icon="inline-start" />}{' '}
            Retry sync
          </Button>
        </SettingRow>
        <SettingRow
          label="App"
          description={
            installed
              ? 'Xpenses is installed on this device.'
              : pwa.canInstall
                ? 'Add Xpenses to your home screen for quick access.'
                : 'Use your browser menu → "Add to Home Screen" to install.'
          }
        >
          {!installed && pwa.canInstall && (
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
        </SettingRow>
      </div>
    </Panel>
  )
}

type IndexItem = { id: string; label: string }

function SettingsPage() {
  const { isAdmin } = useAuth()
  const version = __APP_VERSION__
  const index: IndexItem[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'password', label: 'Password' },
    { id: 'devices', label: 'Devices signed in' },
    { id: 'access', label: 'Access' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'this-device', label: 'This device' },
    { id: 'recurring', label: 'Recurring' },
    ...(isAdmin ? [{ id: 'backup', label: 'Backup & restore' }] : []),
  ]
  const jump = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Your account"
        title="Settings"
        description="Your profile, security and how the app behaves. The default currency is in the top bar."
      />
      <nav
        aria-label="Settings sections"
        className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {index.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => jump(i.id)}
            className="bg-card text-muted-foreground hover:text-foreground h-9 shrink-0 rounded-md border px-3 text-[0.8125rem] font-medium whitespace-nowrap"
          >
            {i.label}
          </button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-6 [&>section]:scroll-mt-24">
        <ProfileSection id="profile" />
        <PasswordSection id="password" />
        <SessionsSection id="devices" />
        <AccessSection id="access" />
        <AppearanceSection id="appearance" />
        <DeviceSection id="this-device" />
        <RecurringSection id="recurring" />
        {isAdmin && <BackupSection id="backup" />}
        <p className="text-muted-foreground font-mono text-[0.6875rem]">Xpenses web {version}</p>
      </div>
    </div>
  )
}

export const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: SettingsPage,
})
