import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { createAccount, listTransactions, loginAsNewUser, waitForServiceWorker } from './helpers'

// A 1×1 PNG, base64.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
// Code-drawn success screens, both for Nu. 10 on 05 Nov 2026 (see internal/receipts/synth).
const fixture = (name: string) =>
  fs.readFileSync(path.resolve(import.meta.dirname, `../../testdata/receipts/${name}`)).toString('base64')
const SCREENS = [
  { bank: 'mBoB', file: 'mbob_synthetic.png', reference: '551-428182', purpose: 'Personal Transfer' },
  { bank: 'mPay', file: 'mpay_synthetic.png', reference: '630911234567', purpose: 'Personal transfer' },
]

// The Web Share Target: Android posts the shared image to /share, the service
// worker parks it and opens the add screen with it attached. The POST is
// made from the page here, which is exactly what the worker sees.
for (const screen of SCREENS) {
  test(`a ${screen.bank} screenshot shared into the app lands on the add screen and is saved with the transaction`, async ({
    page,
  }) => {
    const image = fixture(screen.file)
    await page.goto('/')
    await loginAsNewUser(page)
    await createAccount(page, 'BOB', 'bank', 100000)
    await page.goto('/')
    await waitForServiceWorker(page)

    const ocr = (
      (await (await page.request.get('/api/v1/receipts/capabilities')).json()) as { data: { ocr: boolean } }
    ).data.ocr
    const landed = await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const form = new FormData()
      form.append('title', 'Fund Transfer Via Beneficiary Successful')
      form.append('screenshot', new File([bytes], 'screen.png', { type: 'image/png' }))
      const res = await fetch('/share', { method: 'POST', body: form })
      return res.url
    }, image)
    expect(landed).toMatch(/\/add\?shared=[^&]+$/)

    await page.goto(new URL(landed).pathname + new URL(landed).search)
    await expect(page.getByTestId('attachment')).toContainText('Screenshot attached')
    await expect(page.getByTestId('attachment').locator('img')).toBeVisible()

    if (ocr) {
      // The server read the screen: reference shown, amount and date prefilled.
      await expect(page.getByTestId('receipt')).toContainText(screen.reference, { timeout: 30_000 })
      await expect(page.getByTestId('receipt')).toContainText(screen.bank)
      await expect(page.getByTestId('receipt')).toContainText(screen.purpose)
      await expect(page.getByLabel('Amount')).toHaveValue('10.00')
    } else {
      await page.getByLabel('Amount').fill('10')
    }
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
    if (ocr) {
      const detail = (await (await page.request.get(`/api/v1/transactions/${saved.id}`)).json()) as {
        data: { transaction_date: string; receipt: { reference: string; bank: string } | null }
      }
      // The date read from the screen became the transaction date, and the receipt was kept.
      expect(detail.data.transaction_date).toBe('2026-11-05')
      expect(detail.data.receipt?.reference).toBe(screen.reference)
      expect(detail.data.receipt?.bank).toBe(screen.bank)
    }

    // The transaction page shows the image, served by the API, and what it said.
    await page.goto(`/transactions/${saved.id}`)
    await expect(page.getByRole('heading', { name: 'Screenshot' })).toBeVisible()
    if (ocr) {
      await expect(page.getByTestId('receipt')).toContainText(screen.reference)
      // The reference is searchable.
      const found = await page.request.get(`/api/v1/transactions?search=${screen.reference.slice(-6)}`)
      expect(((await found.json()) as { data: { id: string }[] }).data.map((t) => t.id)).toContain(saved.id)
    }
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
}

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
