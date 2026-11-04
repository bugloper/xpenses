import { expect, test } from '@playwright/test'
import { createAccount, listTransactions, loginAsNewUser, waitForServiceWorker } from './helpers'

// A 1×1 PNG, base64.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// The Web Share Target: Android posts the shared image to /share, the service
// worker parks it and opens the add screen with it attached. The POST is
// made from the page here, which is exactly what the worker sees.
test('a screenshot shared into the app lands on the add screen and is saved with the transaction', async ({
  page,
}) => {
  await page.goto('/')
  await loginAsNewUser(page)
  await createAccount(page, 'BOB', 'bank', 100000)
  await page.goto('/')
  await waitForServiceWorker(page)

  const landed = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const form = new FormData()
    form.append('title', 'Fund Transfer Via Beneficiary Successful')
    form.append('screenshot', new File([bytes], 'mbob.png', { type: 'image/png' }))
    const res = await fetch('/share', { method: 'POST', body: form })
    return res.url
  }, PNG)
  expect(landed).toMatch(/\/add\?shared=[^&]+$/)

  await page.goto(new URL(landed).pathname + new URL(landed).search)
  await expect(page.getByTestId('attachment')).toContainText('Screenshot attached')
  await expect(page.getByTestId('attachment').locator('img')).toBeVisible()

  await page.getByLabel('Amount').fill('10')
  await page.getByRole('button', { name: 'Category', exact: true }).click()
  await page.getByRole('button', { name: 'Family & Social' }).click()
  await page.getByRole('radio', { name: 'Family support' }).click()
  await page.getByRole('button', { name: /^Save$/ }).click()
  await expect(page.getByText('Transaction saved')).toBeVisible()
  await expect(page).toHaveURL(/\/transactions$/)

  const txs = await listTransactions(page)
  const saved = txs.find((t) => t.amount === 1000) as (typeof txs)[number] & {
    id: string
    has_attachment: boolean
  }
  expect(saved?.has_attachment).toBe(true)

  // The transaction page shows the image, served by the API.
  await page.goto(`/transactions/${saved.id}`)
  await expect(page.getByRole('heading', { name: 'Screenshot' })).toBeVisible()
  const img = page.getByRole('img', { name: 'Payment screenshot' })
  await expect(img).toBeVisible()
  const res = await page.request.get(`/api/v1/transactions/${saved.id}/attachment`)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toBe('image/png')

  // And it can be removed.
  await page.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('Screenshot removed')).toBeVisible()
  await expect(page.getByText('No screenshot.')).toBeVisible()
})

test('a screenshot picked in the add sheet is uploaded with the transaction', async ({ page }) => {
  await page.goto('/')
  await loginAsNewUser(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Add transaction' }).first().click()
  await page
    .getByLabel('Attach screenshot')
    .setInputFiles({ name: 'mpay.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') })
  await expect(page.getByText('Screenshot attached')).toBeVisible()
  await page.getByLabel('Amount').fill('25')
  await page.getByRole('button', { name: 'Category', exact: true }).click()
  await page.getByRole('button', { name: 'Food & Groceries' }).click()
  await page.getByRole('radio', { name: 'Eating out' }).click()
  await page.getByRole('button', { name: /^Save$/ }).click()
  await expect(page.getByText('Transaction saved')).toBeVisible()
  const txs = (await listTransactions(page)) as Array<{ amount: number; has_attachment?: boolean }>
  expect(txs.find((t) => t.amount === 2500)?.has_attachment).toBe(true)
})
