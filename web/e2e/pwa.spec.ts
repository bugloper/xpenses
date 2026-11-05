import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { loginAs, waitForServiceWorker } from './helpers'

// Real-browser PWA behaviour against the production build served by Go.
test.describe('PWA', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await loginAs(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('manifest is linked and served with the manifest MIME type', async ({ page }) => {
    const href = await page.locator('link[rel=manifest]').getAttribute('href')
    expect(href).toBeTruthy()
    const res = await page.request.get(href!)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/manifest+json')
    const manifest = (await res.json()) as {
      name: string
      display: string
      icons: Array<{ sizes: string; purpose?: string }>
    }
    expect(manifest.name).toBe('Xpenses')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true)
  })

  test('service worker registers and precaches the app shell', async ({ page }) => {
    await waitForServiceWorker(page)
    const cacheNames = await page.evaluate(() => caches.keys())
    expect(cacheNames.some((n) => n.includes('precache'))).toBe(true)
  })

  test('app shell renders offline and shows the offline indicator', async ({ page, context }) => {
    await waitForServiceWorker(page)
    // Warm the auth status + dashboard data so the persisted cache has them.
    await page.goto('/transactions')
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()

    await context.setOffline(true)
    await page.goto('/transactions')
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()
    // Playwright's network emulation does not flip navigator.onLine in headless
    // Chromium, and the service worker answers API reads from cache, so the
    // browser's own offline event is what the app would see on a real device.
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    await expect(page.getByRole('button', { name: /Sync status: Offline/ })).toBeVisible()
    await context.setOffline(false)
  })

  test('a new service worker version triggers the update prompt', async ({ page }) => {
    await waitForServiceWorker(page)
    const swPath = path.resolve(import.meta.dirname, '../dist/sw.js')
    const original = fs.readFileSync(swPath, 'utf8')
    try {
      // Any byte change makes the browser install a new worker; with
      // registerType 'prompt' it waits and the app shows the toast.
      fs.writeFileSync(swPath, original + `\n// e2e-version-${Date.now()}\n`)
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration()
        await reg?.update()
      })
      await expect(page.getByText('New version available')).toBeVisible({ timeout: 20_000 })
      await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible()
    } finally {
      fs.writeFileSync(swPath, original)
    }
  })

  test('install prompt is offered in Settings when the browser allows it', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByText(/Add to Home Screen/)).toBeVisible()
    // Simulate Chrome's beforeinstallprompt with a stub the app can call.
    await page.evaluate(() => {
      const w = window as unknown as { __installCalls: number }
      w.__installCalls = 0
      const ev = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
        prompt: () => Promise<void>
        userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
      }
      ev.prompt = async () => {
        w.__installCalls += 1
      }
      ev.userChoice = Promise.resolve({ outcome: 'accepted' as const })
      window.dispatchEvent(ev)
    })
    const install = page.getByRole('button', { name: 'Install app' })
    await expect(install).toBeVisible()
    // Settings is long now; bring the button clear of the phone's bottom tab bar.
    await install.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await install.click()
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __installCalls: number }).__installCalls))
      .toBe(1)
    await expect(page.getByText('Installed')).toBeVisible()
  })
})
