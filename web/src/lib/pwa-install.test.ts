import { afterEach, describe, expect, it } from 'vitest'
import {
  INSTALL_SNOOZE_KEY,
  INSTALL_SNOOZE_MS,
  installOffer,
  isIOS,
  readSnoozedUntil,
  snoozeInstallOffer,
} from './pwa-install'

const base = { standalone: false, installed: false, canInstall: false, ios: false, snoozedUntil: null, now: 1_000 }

describe('installOffer', () => {
  it('offers the native prompt when the browser exposes it', () => {
    expect(installOffer({ ...base, canInstall: true })).toBe('native')
  })
  it('offers the iOS steps when there is no native prompt', () => {
    expect(installOffer({ ...base, ios: true })).toBe('ios')
  })
  it('prefers native over the iOS steps', () => {
    expect(installOffer({ ...base, canInstall: true, ios: true })).toBe('native')
  })
  it('stays quiet in browsers with neither', () => {
    expect(installOffer(base)).toBeNull()
  })
  it('never offers when already installed or running standalone', () => {
    expect(installOffer({ ...base, canInstall: true, installed: true })).toBeNull()
    expect(installOffer({ ...base, canInstall: true, standalone: true })).toBeNull()
  })
  it('respects an active snooze and expires it', () => {
    expect(installOffer({ ...base, canInstall: true, snoozedUntil: 2_000 })).toBeNull()
    expect(installOffer({ ...base, canInstall: true, snoozedUntil: 999 })).toBe('native')
  })
})

describe('isIOS', () => {
  it('detects iPhone and iPad user agents', () => {
    expect(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5)).toBe(true)
    expect(isIOS('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'iPad', 5)).toBe(true)
  })
  it('detects iPadOS pretending to be a Mac by its touch points', () => {
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true)
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false)
  })
  it('is false for Android and desktop', () => {
    expect(isIOS('Mozilla/5.0 (Linux; Android 14; Pixel 7)', 'Linux armv8l', 5)).toBe(false)
    expect(isIOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0)).toBe(false)
  })
})

describe('snooze storage', () => {
  afterEach(() => localStorage.clear())
  it('round-trips the snooze deadline', () => {
    snoozeInstallOffer(5_000)
    expect(readSnoozedUntil()).toBe(5_000 + INSTALL_SNOOZE_MS)
  })
  it('treats garbage as no snooze', () => {
    localStorage.setItem(INSTALL_SNOOZE_KEY, 'soon')
    expect(readSnoozedUntil()).toBeNull()
  })
})
