import { test, expect } from '@playwright/test'
import { createAccount, listTransactions, loginAsNewUser } from './helpers'

test('add an expense from the + button', async ({ page }) => {
  await page.goto('/')
  await loginAsNewUser(page)
  await createAccount(page, 'E2E Wallet', 'cash', 50000)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await page.getByRole('button', { name: 'Add transaction' }).first().click()
  await expect(page.getByRole('heading', { name: 'Add transaction' })).toBeVisible()
  await page.getByLabel('Amount').fill('85.40')
  await page.getByRole('radio', { name: 'Food' }).click()
  await page.getByLabel('Account').first().click()
  await page.getByRole('option', { name: /E2E Wallet/ }).click()
  await page.getByRole('button', { name: /^Save$/ }).click()
  await expect(page.getByText(/saved/i).first()).toBeVisible()
  const txs = await listTransactions(page)
  expect(txs.some((t) => t.amount === 8540)).toBe(true)
})
