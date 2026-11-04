import { expect, test, type APIRequestContext } from '@playwright/test'
import path from 'node:path'

// Import the synthetic encrypted BOB statement, then run auto-match in the
// workspace. Needs the Vite dev server and the Go API; skips when nothing is
// listening (same convention as add-expense.spec.ts).
const PDF = path.resolve(import.meta.dirname, '../../testdata/statements/bob_synthetic_encrypted.pdf')
const PASSWORD = '0101'

async function reachable(request: APIRequestContext, baseURL: string): Promise<boolean> {
  try {
    const res = await request.get(`${baseURL}/api/v1/health`, { timeout: 3_000 })
    return res.ok()
  } catch {
    return false
  }
}

/**
 * Creates a fresh bank account per run. Row fingerprints are per account, so a
 * re-run still imports rows; the identical bytes are flagged as a duplicate
 * statement (sha256) which the test forces through "Import anyway".
 */
async function createAccount(request: APIRequestContext, baseURL: string): Promise<string> {
  const created = await request.post(`${baseURL}/api/v1/accounts`, {
    data: { name: `E2E Bank ${Date.now()}`, type: 'bank', opening_balance: 0 },
  })
  expect(created.ok()).toBeTruthy()
  return ((await created.json()) as { data: { id: string } }).data.id
}

test.describe('statement import and auto-match', () => {
  test.describe.configure({ mode: 'serial' })
  let statementId: string | null = null

  test('imports the encrypted BOB statement through the wizard', async ({ page, baseURL, request }) => {
    test.skip(!(await reachable(request, baseURL!)), 'dev server / API not running')
    await createAccount(request, baseURL!)

    await page.goto('/statements')
    await page.getByRole('button', { name: 'Import statement' }).click()
    await expect(page.getByRole('heading', { name: 'Import statement' })).toBeVisible()

    // Account select (Radix): open and pick the account created above.
    await page.getByLabel('Account').first().click()
    await page.getByRole('option', { name: /E2E Bank/ }).last().click()

    await page.locator('input[type=file]').setInputFiles(PDF)
    await expect(page.getByRole('dialog').getByText('bob_synthetic_encrypted.pdf')).toBeVisible()

    // Wrong password surfaces inline on the password field and keeps the form.
    await page.getByLabel('PDF password').fill('9999')
    await page.getByRole('button', { name: /parse statement/i }).click()
    await expect(page.getByRole('alert')).toContainText(/password did not open/i)

    await page.getByLabel('PDF password').fill(PASSWORD)
    await page.getByRole('button', { name: /parse statement/i }).click()

    // Preview step: rows parsed, balances evaluated.
    await expect(page.getByRole('heading', { name: /^Transactions \(\d+\)/ })).toBeVisible({ timeout: 15_000 })
    const rows = page.locator('[aria-label^="Row "][aria-label$=" description"], li:has([aria-label="Description"])')
    expect(await rows.count()).toBeGreaterThan(0)
    const banner = page.locator('[data-state]').filter({ hasText: /Balances check out|Closing balance differs|Balance check unavailable/ })
    await expect(banner.first()).toBeVisible()

    // A re-import of the same bytes is flagged as a duplicate; force it so the test is rerunnable.
    const importAnyway = page.getByRole('button', { name: 'Import anyway' })
    if (await importAnyway.isVisible()) await importAnyway.click()

    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: /^Import \d+ rows?$/ }).click()

    await expect(page.getByText(/Imported \d+ transactions?/)).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/reconciliation\/[0-9a-f-]+/, { timeout: 15_000 })
    statementId = /\/reconciliation\/([^/?]+)/.exec(page.url())?.[1] ?? null
    expect(statementId).toBeTruthy()
  })

  test('runs auto-match in the workspace and can reach the report', async ({ page, baseURL, request }) => {
    test.skip(!(await reachable(request, baseURL!)), 'dev server / API not running')
    test.skip(!statementId, 'import test did not run')

    await page.goto(`/reconciliation/${statementId}`)
    await expect(page.getByRole('heading', { name: /bob_synthetic_encrypted\.pdf/ })).toBeVisible()
    await expect(page.getByText('Statement debits')).toBeVisible()

    const auto = page.getByRole('button', { name: 'Auto-match' })
    if (await auto.isEnabled()) {
      await auto.click()
      await expect(page.getByText(/Auto-matched \d+ lines?|No new confident matches/)).toBeVisible({ timeout: 15_000 })
    }

    await page.getByRole('button', { name: 'Report' }).click()
    await expect(page.getByRole('heading', { name: 'Reconciliation report' })).toBeVisible()
    await expect(page.getByText(/Closing balance (verified|not verified)/)).toBeVisible({ timeout: 10_000 })
  })
})
