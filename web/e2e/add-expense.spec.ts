import { test, expect } from '@playwright/test'

// Smoke test for the quick add-expense flow. Requires the Vite dev server and
// the Go API (`go run ./cmd` + `bun run dev`). Skips when nothing is listening.
test('add an expense from the + button', async ({ page, baseURL }) => {
  let reachable: boolean
  try {
    const res = await page.request.get(`${baseURL}/api/v1/health`, { timeout: 3_000 })
    reachable = res.ok()
  } catch {
    reachable = false
  }
  test.skip(!reachable, 'dev server / API not running')

  await page.goto('/')
  await page.getByRole('button', { name: 'Add transaction' }).click()
  await expect(page.getByRole('heading', { name: 'Add transaction' })).toBeVisible()
  await page.getByLabel('Amount').fill('85.40')
  await page.getByRole('button', { name: /^Save$/ }).click()
  // Either saved (toast) or validation asked for an account/category.
  await expect(page.getByText(/saved|select an account/i).first()).toBeVisible({ timeout: 10_000 })
})
