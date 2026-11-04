import { expect, test } from '@playwright/test'
import { loginAsNewUser } from './helpers'

// Budgets have their own page: a big amount field, then the category picker.
test('set, edit and remove a monthly budget from the Budgets page', async ({ page }) => {
  await page.goto('/')
  await loginAsNewUser(page)
  await page.goto('/budgets')
  await expect(page.getByRole('heading', { name: 'Budgets' })).toBeVisible()

  await page.getByRole('button', { name: 'New budget' }).click()
  await expect(page.getByRole('heading', { name: 'New budget' })).toBeVisible()
  await page.getByLabel('Amount').fill('5000')
  await page.getByRole('button', { name: 'Category', exact: true }).click()
  await page.getByRole('button', { name: 'Food & Groceries' }).click()
  await page.getByRole('radio', { name: 'Eating out' }).click()
  await page.getByRole('button', { name: 'Set budget' }).click()
  await expect(page.getByText('Budget set')).toBeVisible()

  const row = page.getByRole('button', { name: 'Edit Eating out budget' })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Nu. 5,000')

  // Edit: the amount is prefilled, the category already chosen.
  await row.click()
  await expect(page.getByRole('heading', { name: 'Edit budget' })).toBeVisible()
  await expect(page.getByLabel('Amount')).toHaveValue('5000.00')
  await expect(page.getByRole('button', { name: 'Category', exact: true })).toContainText('Eating out')
  await page.getByLabel('Amount').fill('6500')
  await page.getByRole('button', { name: 'Save budget' }).click()
  await expect(page.getByText('Budget updated')).toBeVisible()
  await expect(row).toContainText('Nu. 6,500')

  // Remove.
  await row.click()
  await page.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('Budget removed')).toBeVisible()
  await expect(page.getByText('No budgets yet')).toBeVisible()
})
