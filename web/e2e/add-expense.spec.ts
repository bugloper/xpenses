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

test('create a new category from inside the add sheet and save with it', async ({ page }) => {
  await page.goto('/')
  await loginAsNewUser(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Add transaction' }).first().click()
  await expect(page.getByRole('heading', { name: 'Add transaction' })).toBeVisible()
  await page.getByLabel('Amount').fill('120')

  await page.getByRole('button', { name: 'New category' }).click()
  const sheet = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'New category' }) })
  await expect(sheet).toBeVisible()
  await sheet.getByLabel('Name').fill('Momo')
  await sheet.getByRole('radio', { name: 'utensils' }).click()
  await sheet.getByRole('button', { name: 'Create' }).click()

  await expect(page.getByText('Category created')).toBeVisible()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Add transaction' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Momo' })).toHaveAttribute('aria-checked', 'true')

  await page.getByRole('button', { name: /^Save$/ }).click()
  await expect(page.getByText(/saved/i).first()).toBeVisible()
  const txs = await listTransactions(page)
  expect(txs.some((t) => t.amount === 12000)).toBe(true)

  // The new category is a normal one: it shows on the Categories page.
  await page.goto('/categories')
  await expect(page.getByText('Momo')).toBeVisible()
})
