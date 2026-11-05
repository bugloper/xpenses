import { expect, test } from '@playwright/test'
import { HEADERS, OWNER, loginAs, loginAsNewUser } from './helpers'

// The server sends no email: the admin issues a one-time link, the user opens
// it, chooses a new password and signs in with it.
test('an admin-issued reset link lets a user choose a new password', async ({ page }) => {
  await page.goto('/')
  const user = await loginAsNewUser(page, 'Forgetful')
  await page.request.post('/api/v1/auth/logout', { headers: HEADERS })

  // The sign-in page explains how to get a link.
  await page.goto('/login')
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()
  await page.getByRole('button', { name: 'Got it' }).click()

  // The admin creates the link from the Users list.
  await loginAs(page)
  await page.goto('/admin')
  // Other runs may have left users with the same name; find this one by email.
  const row = page.locator('tr, li').filter({ hasText: user.email }).filter({ visible: true })
  await row.getByRole('button', { name: 'Actions for Forgetful' }).click()
  await page.getByRole('menuitem', { name: 'Reset password…' }).click()
  const link = await page.getByRole('textbox', { name: 'Reset link' }).inputValue()
  expect(link).toContain('/reset-password?token=')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.request.post('/api/v1/auth/logout', { headers: HEADERS })

  // The user opens it and sets a new password; the old one stops working.
  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  await page.getByLabel('New password', { exact: true }).fill('brand-new-password-1')
  await page.getByLabel('Confirm new password').fill('brand-new-password-1')
  await page.getByRole('button', { name: 'Set new password' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('Password changed')).toBeVisible()

  const old = await page.request.post('/api/v1/auth/login', {
    headers: HEADERS,
    data: { email: user.email, password: OWNER.password },
  })
  expect(old.status()).toBe(401)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill('brand-new-password-1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  // The link was single use.
  await page.request.post('/api/v1/auth/logout', { headers: HEADERS })
  await page.goto(link)
  await page.getByLabel('New password', { exact: true }).fill('yet-another-password-1')
  await page.getByLabel('Confirm new password').fill('yet-another-password-1')
  await page.getByRole('button', { name: 'Set new password' }).click()
  await expect(page.getByRole('alert')).toContainText(/already been used/)
})
