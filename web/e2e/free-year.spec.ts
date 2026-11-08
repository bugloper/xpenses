import { expect, test } from '@playwright/test'
import { HEADERS, loginAs, loginAsNewUser } from './helpers'

// A user gets a year; when it ends the app shows the expired page until the
// admin extends the date from the Users list.
test('an expired user sees the expired page until the admin extends their access', async ({ page }) => {
  await page.goto('/')
  const user = await loginAsNewUser(page, 'Expiring')
  await page.goto('/settings')
  await expect(page.getByText(/Until .* 365 days left/)).toBeVisible()
  await page.request.post('/api/v1/auth/logout', { headers: HEADERS })

  // The admin ends it yesterday.
  await loginAs(page)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const res = await page.request.patch(`/api/v1/admin/users/${user.id}`, { headers: HEADERS, data: { access_until: yesterday } })
  expect(res.status()).toBe(200)
  await page.request.post('/api/v1/auth/logout', { headers: HEADERS })

  // The user can still sign in, but only reaches the expired page.
  await loginAs(page, user.email, user.password)
  await page.goto('/transactions')
  await expect(page).toHaveURL(/\/expired$/)
  await expect(page.getByRole('heading', { name: 'Your free year has ended' })).toBeVisible()
  expect((await page.request.get('/api/v1/accounts')).status()).toBe(403)
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login$/)

  // The admin extends by a year from the Users list.
  await loginAs(page)
  await page.goto('/admin')
  // The email also appears in the invite list ("used by …"): keep to the user's own row.
  const row = page
    .locator('tr, li')
    .filter({ hasText: user.email })
    .filter({ has: page.getByRole('button', { name: 'Actions for Expiring' }) })
    .filter({ visible: true })
  await expect(row).toContainText('Expired')
  await row.getByRole('button', { name: 'Actions for Expiring' }).click()
  await page.getByRole('menuitem', { name: 'Extend access…' }).click()
  await page.getByRole('button', { name: '+1 year' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/can use Xpenses until/)).toBeVisible()
  await page.request.post('/api/v1/auth/logout', { headers: HEADERS })

  await loginAs(page, user.email, user.password)
  await page.goto('/transactions')
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()
})
