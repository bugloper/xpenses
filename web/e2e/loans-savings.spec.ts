import { expect, test, type Page } from '@playwright/test'
import { HEADERS, createAccount, loginAsNewUser } from './helpers'

async function api<T>(page: Page, path: string): Promise<T> {
  const res = await page.request.get(`/api/v1${path}`, { headers: HEADERS })
  expect(res.status(), await res.text()).toBe(200)
  return ((await res.json()) as { data: T }).data
}

async function balance(page: Page, id: string) {
  return (await api<{ current_balance: number }>(page, `/accounts/${id}`)).current_balance
}

// Lending is not spending and being repaid is not income: only the interest
// is. The loan keeps what is still owed.
test('lend money, get part of it back with interest', async ({ page }) => {
  await page.goto('/')
  await loginAsNewUser(page)
  const bank = await createAccount(page, 'Loan Bank', 'bank', 1000000)
  await page.goto('/loans')
  await expect(page.getByText('No loans yet')).toBeVisible()

  // Lend 2,000 to someone new from the add sheet.
  await page.getByRole('button', { name: 'Lend or borrow' }).first().click()
  await expect(page.getByRole('heading', { name: 'Add transaction' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Lend', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByLabel('Amount').fill('2000')
  await page.getByLabel('Who you lent it to').fill('Ugyen Dorji')
  await page.getByLabel('From account').click()
  await page.getByRole('option', { name: /^Loan Bank/ }).click()
  await page.getByRole('button', { name: /^Save$/ }).click()
  await expect(page.getByText(/saved/i).first()).toBeVisible()

  const row = page.getByRole('link', { name: /^Ugyen Dorji/ })
  await expect(row).toContainText('2,000')
  await row.click()
  await expect(page.getByRole('heading', { name: 'Ugyen Dorji' })).toBeVisible()

  // Paid back 500 with 50 interest, from the loan's own page.
  await page.getByRole('button', { name: 'Record a repayment' }).click()
  await expect(page.getByRole('tab', { name: 'Get repaid' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('combobox', { name: 'Loan' })).toContainText('Ugyen Dorji')
  await page.getByLabel('Amount').fill('500')
  await page.getByLabel('Interest received (optional)').fill('50')
  await page.getByLabel('Into account').click()
  await page.getByRole('option', { name: /^Loan Bank/ }).click()
  await page.getByRole('button', { name: /^Save$/ }).click()
  await expect(page.getByText(/saved/i).first()).toBeVisible()

  await expect(page.getByText('Still owed to you')).toBeVisible()
  await expect(page.getByText('Nu. 1,500').first()).toBeVisible()
  await expect(page.getByText('Interest earned')).toBeVisible()
  await expect(page.getByText('Interest from Ugyen Dorji')).toBeVisible()

  expect(await balance(page, bank)).toBe(1000000 - 200000 + 50000 + 5000)
  const today = new Date().toISOString().slice(0, 10)
  const s = await api<{ income: number; expenses: number }>(
    page,
    `/reports/summary?from=2000-01-01&to=${today}`,
  )
  expect(s).toMatchObject({ income: 5000, expenses: 0 })
})

// A goal is an allocation: adding to it moves no money, unless asked to move
// it into the goal's account, which is a transfer and still not spending.
test('save toward a goal, moving the money into savings', async ({ page }) => {
  await page.goto('/')
  await loginAsNewUser(page)
  const bank = await createAccount(page, 'Goal Bank', 'bank', 500000)
  const savings = await createAccount(page, 'Goal Savings', 'savings', 0)
  await page.goto('/savings')
  await page.getByRole('button', { name: 'New goal' }).first().click()
  await page.getByLabel('Amount').fill('1000')
  await page.getByLabel('Saving for').fill('New phone')
  await page.getByRole('button', { name: 'Create goal' }).click()
  await expect(page.getByText('Goal created')).toBeVisible()

  // The goal opens; add 250 from the bank.
  const sheet = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'New phone' }) })
  await expect(sheet).toBeVisible()
  await sheet.getByLabel('Amount', { exact: true }).fill('250')
  await sheet.getByLabel('Where the money is').click()
  await page.getByRole('option', { name: 'Move it from Goal Bank' }).click()
  await sheet.getByRole('button', { name: 'Add to goal' }).click()
  await expect(page.getByText('Added to the goal')).toBeVisible()
  await expect(sheet.getByText('25% saved').first()).toBeVisible()

  expect(await balance(page, bank)).toBe(500000 - 25000)
  expect(await balance(page, savings)).toBe(25000)
  const today = new Date().toISOString().slice(0, 10)
  const s = await api<{ income: number; expenses: number }>(
    page,
    `/reports/summary?from=2000-01-01&to=${today}`,
  )
  expect(s).toMatchObject({ income: 0, expenses: 0 })

  // Removing it reverses the transfer too.
  await sheet.getByRole('button', { name: 'Remove this contribution' }).click()
  await expect(page.getByText('Removed, with its transfer')).toBeVisible()
  expect(await balance(page, bank)).toBe(500000)
})

// Saving toward a goal from the record sheet, and the reports that show it.
test('set money aside from the record sheet and find it in reports', async ({ page }) => {
  await page.goto('/')
  await loginAsNewUser(page)
  await createAccount(page, 'Sheet Bank', 'bank', 300000)
  const goal = await page.request.post('/api/v1/savings-goals', {
    headers: HEADERS,
    data: { name: 'Bicycle', target_amount: 400000 },
  })
  expect(goal.status()).toBe(201)

  await page.goto('/')
  await page.getByRole('button', { name: 'Add transaction' }).first().click()
  await page.getByRole('tab', { name: 'Transfer' }).click()
  await page.getByRole('tab', { name: 'Toward a goal' }).click()
  await expect(page.getByText('Money set aside for a savings goal. Never spending.')).toBeVisible()
  await page.getByLabel('Amount').fill('1000')
  await expect(page.getByText(/Nu\. 1,000 after this/)).toBeVisible()
  await page.getByRole('button', { name: 'Set aside' }).click()
  await expect(page.getByText('Nu. 1,000 set aside for Bicycle')).toBeVisible()

  // The dashboard shows the goal under where the user stands, not as spending.
  await expect(page.getByRole('heading', { name: 'Where you stand' })).toBeVisible()
  await expect(page.getByText('Set aside for 1 goal')).toBeVisible()

  await page.goto('/reports?tab=savings')
  await expect(page.getByRole('heading', { name: 'Goal progress' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Bicycle/ })).toContainText('25%')
  await page.getByRole('tab', { name: 'Loans' }).click()
  await expect(page.getByText('No loans')).toBeVisible()
  await page.getByRole('tab', { name: 'Income' }).click()
  await expect(page.getByRole('heading', { name: 'Income by month' })).toBeVisible()
})
