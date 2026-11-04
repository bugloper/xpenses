// Captures the `beforeinstallprompt` event so Settings can offer an Install button.
import { useSyncExternalStore } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    notify()
  })
}

type Snapshot = { canInstall: boolean; installed: boolean; standalone: boolean }
let snapshot: Snapshot = { canInstall: false, installed: false, standalone: false }
function getSnapshot(): Snapshot {
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true)
  const next = { canInstall: deferred !== null, installed, standalone }
  if (
    next.canInstall !== snapshot.canInstall ||
    next.installed !== snapshot.installed ||
    next.standalone !== snapshot.standalone
  ) {
    snapshot = next
  }
  return snapshot
}

export function usePwaInstall() {
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getSnapshot,
    getSnapshot,
  )
  return {
    ...state,
    async install() {
      if (!deferred) return 'unavailable' as const
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      notify()
      return outcome
    },
  }
}
