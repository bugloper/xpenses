import { expect, test } from '@playwright/test'
import { loginAsNewUser } from './helpers'

// A 1×1 PNG, base64.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

test('a user sets a profile picture from Settings and it shows in the app badge', async ({ page }) => {
  await page.goto('/')
  await loginAsNewUser(page, 'Portrait')
  await page.goto('/settings')
  await expect(page.getByRole('button', { name: 'Add photo' })).toBeVisible()

  await page
    .getByLabel('Choose a profile picture')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') })
  await expect(page.getByText('Profile picture updated')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible()
  // Every badge now shows the picture, served by the API as a JPEG.
  const img = page.locator('img[src*="/api/v1/auth/me/avatar"]:visible').first()
  await expect(img).toBeVisible()
  const res = await page.request.get('/api/v1/auth/me/avatar')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toBe('image/jpeg')

  await page.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('Profile picture removed')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add photo' })).toBeVisible()
  expect((await page.request.get('/api/v1/auth/me/avatar')).status()).toBe(404)
})
