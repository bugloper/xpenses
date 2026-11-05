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
  return { ...state, install: promptInstall }
}

/** Shows the browser's native install dialog, if one is available. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable'
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  notify()
  return outcome
}

// ---- Install offer after sign-in -------------------------------------------
//
// Once per browser session, the signed-in shell offers to install the app:
// natively where the browser exposes `beforeinstallprompt`, or with the
// "Share → Add to Home Screen" instructions on iOS, which has no such event.
// Dismissing the offer snoozes it; installing (or running installed) ends it.

export const INSTALL_SNOOZE_KEY = 'xpenses:install-offer-snoozed-until'
export const INSTALL_SESSION_KEY = 'xpenses:install-offer-shown'
export const INSTALL_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000

export type InstallOffer = 'native' | 'ios' | null

export function isIOS(
  ua: string = navigator.userAgent,
  platform: string = navigator.platform,
  maxTouchPoints: number = navigator.maxTouchPoints,
): boolean {
  // iPadOS reports itself as a Mac; the touch points give it away.
  return /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1)
}

export function installOffer(input: {
  standalone: boolean
  installed: boolean
  canInstall: boolean
  ios: boolean
  snoozedUntil: number | null
  now: number
}): InstallOffer {
  if (input.standalone || input.installed) return null
  if (input.snoozedUntil !== null && input.snoozedUntil > input.now) return null
  if (input.canInstall) return 'native'
  if (input.ios) return 'ios'
  return null
}

export function readSnoozedUntil(): number | null {
  try {
    const raw = localStorage.getItem(INSTALL_SNOOZE_KEY)
    const n = raw === null ? NaN : Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function snoozeInstallOffer(now = Date.now()): void {
  try {
    localStorage.setItem(INSTALL_SNOOZE_KEY, String(now + INSTALL_SNOOZE_MS))
  } catch {
    // Storage unavailable (private mode): the offer simply returns next session.
  }
}

export function offerShownThisSession(): boolean {
  try {
    return sessionStorage.getItem(INSTALL_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export function markOfferShown(): void {
  try {
    sessionStorage.setItem(INSTALL_SESSION_KEY, '1')
  } catch {
    // ignore
  }
}
