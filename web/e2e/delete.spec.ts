import { expect, test, type Page } from '@playwright/test'
import { HEADERS, createAccount, listTransactions, loginAsNewUser } from './helpers'

async function addExpense(page: Page, accountId: string, payee: string, amount: number) {
  const res = await page.request.post('/api/v1/transactions', {
    headers: HEADERS,
    data: { type: 'expense', amount, account_id: accountId, payee, transaction_date: '2026-11-05' },
  })
  expect(res.status(), await res.text()).toBe(201)
}

// Select mode on the ledger: tick rows, delete them together.
test('select several transactions and delete them at once', async ({ page }) => {
  await page.goto('/')
  await loginAsNewUser(page)
  const acc = await createAccount(page, 'Bulk Wallet')
  await addExpense(page, acc, 'Keep me', 1000)
  await addExpense(page, acc, 'Bin one', 2000)
  await addExpense(page, acc, 'Bin two', 3000)

  await page.goto('/transactions')
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()
  await page.getByRole('button', { name: 'Select' }).click()
  await page.getByRole('checkbox', { name: /^Select Bin one/ }).click()
  await page.getByRole('checkbox', { name: /^Select Bin two/ }).click()
  const bar = page.getByRole('toolbar', { name: 'Selected transactions' })
  await expect(bar).toContainText('2')
  await bar.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('heading', { name: 'Delete 2 transactions?' })).toBeVisible()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('2 transactions deleted')).toBeVisible()
  await expect(bar).toBeHidden()

  const left = await listTransactions(page)
  expect(left.map((t) => t.amount)).toEqual([1000])
})

// An account with history can't go; an unused one can.
test('delete an unused account, and be told why a used one stays', async ({ page }) => {
  await page.goto('/')
  await loginAsNewUser(page)
  const used = await createAccount(page, 'Used Account')
  await createAccount(page, 'Spare Account')
  await addExpense(page, used, 'Something', 500)

  await page.goto('/accounts')
  await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Actions for Used Account' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await expect(page.getByRole('heading', { name: "Used Account can't be deleted" })).toBeVisible()
  await expect(page.getByRole('alertdialog')).toContainText('1 transaction')
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Actions for Spare Account' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await expect(page.getByRole('heading', { name: 'Delete Spare Account?' })).toBeVisible()
  await page.getByRole('button', { name: 'Delete account' }).click()
  await expect(page.getByText('Account deleted')).toBeVisible()
  await expect(page.getByText('Spare Account')).toHaveCount(0)
})

// A main category goes with its sub-categories; its transactions stay, uncategorised.
test('delete a category and keep its transactions', async ({ page }) => {
  await page.goto('/')
  await loginAsNewUser(page)
  const acc = await createAccount(page, 'Cat Wallet')
  const cats = (await (await page.request.get('/api/v1/categories')).json()) as {
    data: Array<{ id: string; name: string }>
  }
  const coffee = cats.data.find((c) => c.name === 'Tea & coffee')!
  const res = await page.request.post('/api/v1/transactions', {
    headers: HEADERS,
    data: {
      type: 'expense',
      amount: 450,
      account_id: acc,
      category_id: coffee.id,
      transaction_date: '2026-11-05',
    },
  })
  expect(res.status()).toBe(201)

  await page.goto('/categories')
  await expect(page.getByRole('heading', { name: 'Categories', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Actions for Food & Groceries' }).first().click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByRole('heading', { name: 'Delete Food & Groceries?' })).toBeVisible()
  await expect(dialog).toContainText(/sub-categories are deleted too/)
  await expect(dialog).toContainText('1 transaction stays and becomes Uncategorised')
  await dialog.getByRole('button', { name: 'Delete category' }).click()
  await expect(page.getByText('Category deleted')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Food & Groceries', exact: true })).toHaveCount(0)

  const txs = (await (await page.request.get('/api/v1/transactions')).json()) as {
    data: Array<{ category_id: string | null }>
  }
  expect(txs.data).toHaveLength(1)
  expect(txs.data[0]!.category_id).toBeNull()
})
