import { test, expect } from '@playwright/test'
import { createAccount, listTransactions, loginAsNewUser, waitForServiceWorker } from './helpers'

// An expense recorded while offline is queued in IndexedDB, shown as pending,
// and synced (exactly once) when the network returns.
test('offline expense is queued and synced when back online', async ({ page, context }) => {
  await page.goto('/')
  await loginAsNewUser(page, 'Offline tester')
  await createAccount(page, 'Offline Wallet', 'cash', 10000)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await waitForServiceWorker(page)
  // Load the add sheet's data (accounts, categories) while online.
  await page.getByRole('button', { name: 'Add transaction' }).first().click()
  await expect(page.getByRole('heading', { name: 'Add transaction' })).toBeVisible()

  await context.setOffline(true)
  await page.getByLabel('Amount').fill('12.50')
  await page.getByRole('radio', { name: 'Groceries' }).click()
  await page.getByLabel('Account').first().click()
  await page.getByRole('option', { name: /Offline Wallet/ }).click()
  await page.getByRole('button', { name: /^Save$/ }).click()
  await expect(page.getByText('Saved offline')).toBeVisible()
  await expect(page.getByRole('button', { name: /Sync status: Offline · 1 pending/ })).toBeVisible()

  const queued = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('xpensiv')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          try {
            const db = req.result
            const store = db.transaction('pendingTransactions').objectStore('pendingTransactions')
            const count = store.count()
            count.onsuccess = () => resolve(count.result)
            count.onerror = () => reject(count.error)
          } catch (e) {
            reject(e)
          }
        }
      }),
  )
  expect(queued).toBe(1)

  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByRole('button', { name: /Sync status/ })).toHaveCount(0, { timeout: 20_000 })
  const txs = await listTransactions(page)
  expect(txs.filter((t) => t.amount === 1250)).toHaveLength(1)
})
