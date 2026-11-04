import { expect, test } from '@playwright/test'
import { loginAs } from './helpers'

// The install snackbar after sign-in. Headless Chromium never fires
// `beforeinstallprompt`, so the native path is covered by unit tests; the iOS
// path depends only on the user agent and runs here in a real browser.
test.describe('install snackbar after sign-in', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  })

  test('offers Add to Home Screen on iOS, and "Not now" silences it', async ({ page }) => {
    await page.goto('/')
    await loginAs(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    await expect(page.getByText('Install Xpensiv')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Tap Share, then "Add to Home Screen"/)).toBeVisible()

    await page.getByRole('button', { name: 'Not now' }).click()
    await expect(page.getByText('Install Xpensiv')).toBeHidden()

    // Snoozed: a later visit stays quiet.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await page.waitForTimeout(2_500)
    await expect(page.getByText('Install Xpensiv')).toBeHidden()
  })
})
