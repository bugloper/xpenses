import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { INSTALL_SESSION_KEY, INSTALL_SNOOZE_KEY } from '@/lib/pwa-install'
import { INSTALL_OFFER_DELAY_MS, PwaInstallPrompt } from './PwaInstallPrompt'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), dismiss: vi.fn() }) }))

const toastMock = vi.mocked(toast)

function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome }),
  })
  act(() => {
    window.dispatchEvent(e)
  })
  return e
}

function useIPhoneUserAgent() {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  )
}

describe('PwaInstallPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    sessionStorage.clear()
    toastMock.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('offers native install once the browser allows it, and installs on tap', async () => {
    render(<PwaInstallPrompt />)
    const e = fireBeforeInstallPrompt('accepted')
    act(() => vi.advanceTimersByTime(INSTALL_OFFER_DELAY_MS))

    expect(toastMock).toHaveBeenCalledTimes(1)
    const [title, opts] = toastMock.mock.calls[0] as unknown as [string, { description: string; action: { label: string; onClick: () => void } }]
    expect(title).toBe('Install Xpenses')
    expect(opts.description).toMatch(/home screen/i)
    expect(opts.action.label).toBe('Install')
    expect(sessionStorage.getItem(INSTALL_SESSION_KEY)).toBe('1')

    await act(async () => {
      opts.action.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(e.prompt).toHaveBeenCalled()
    expect(toastMock.success).toHaveBeenCalledWith('Installed')
    expect(localStorage.getItem(INSTALL_SNOOZE_KEY)).toBeNull()
  })

  it('shows the Add to Home Screen steps on iOS and snoozes on "Not now"', () => {
    useIPhoneUserAgent()
    render(<PwaInstallPrompt />)
    act(() => vi.advanceTimersByTime(INSTALL_OFFER_DELAY_MS))

    expect(toastMock).toHaveBeenCalledTimes(1)
    const [, opts] = toastMock.mock.calls[0] as unknown as [string, { description: string; action: { label: string }; cancel: { onClick: () => void } }]
    expect(opts.description).toMatch(/Share.*Add to Home Screen/)
    expect(opts.action.label).toBe('Got it')

    opts.cancel.onClick()
    expect(Number(localStorage.getItem(INSTALL_SNOOZE_KEY))).toBeGreaterThan(Date.now())
  })

  it('does not nag: silent while snoozed, and once per session', () => {
    useIPhoneUserAgent()
    localStorage.setItem(INSTALL_SNOOZE_KEY, String(Date.now() + 60_000))
    render(<PwaInstallPrompt />)
    act(() => vi.advanceTimersByTime(INSTALL_OFFER_DELAY_MS))
    expect(toastMock).not.toHaveBeenCalled()

    localStorage.clear()
    sessionStorage.setItem(INSTALL_SESSION_KEY, '1')
    render(<PwaInstallPrompt />)
    act(() => vi.advanceTimersByTime(INSTALL_OFFER_DELAY_MS))
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('stays quiet in a browser with no install path', () => {
    render(<PwaInstallPrompt />)
    act(() => vi.advanceTimersByTime(INSTALL_OFFER_DELAY_MS))
    expect(toastMock).not.toHaveBeenCalled()
  })
})
