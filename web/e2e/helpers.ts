import { expect, type APIRequestContext, type Page } from '@playwright/test'

export const OWNER = { name: 'Owner', email: 'owner@example.com', password: 'owner-password-123' }
export const HEADERS = { 'X-Xpensiv-Client': 'e2e' }

let counter = 0
/** A fresh, unique email for tests that need their own isolated user. */
export function uniqueEmail(prefix = 'user') {
  counter += 1
  return `${prefix}-${process.pid}-${Date.now()}-${counter}@example.com`
}

/** Creates the owner if the instance is not set up yet (idempotent). */
export async function ensureOwner(request: APIRequestContext) {
  const status = await request.get('/api/v1/auth/status')
  const body = (await status.json()) as { data: { setup_required: boolean } }
  if (body.data.setup_required) {
    const res = await request.post('/api/v1/auth/setup', { headers: HEADERS, data: OWNER })
    expect([201, 409]).toContain(res.status())
  }
}

/** Signs the browser context in through the API (cookies are shared with the page). */
export async function loginAs(page: Page, email = OWNER.email, password = OWNER.password) {
  const res = await page.request.post('/api/v1/auth/login', { headers: HEADERS, data: { email, password } })
  expect(res.status(), await res.text()).toBe(200)
}

/** Registers a brand-new user via an admin invite and signs the page in as them. */
export async function loginAsNewUser(page: Page, name = 'Tester') {
  await loginAs(page)
  const inv = await page.request.post('/api/v1/admin/invites', { headers: HEADERS, data: {} })
  expect(inv.status()).toBe(201)
  const token = ((await inv.json()) as { data: { token: string } }).data.token
  await page.request.post('/api/v1/auth/logout', { headers: HEADERS })
  const email = uniqueEmail()
  const res = await page.request.post('/api/v1/auth/register', {
    headers: HEADERS,
    data: { name, email, password: OWNER.password, invite_token: token },
  })
  expect(res.status(), await res.text()).toBe(201)
  return { email, password: OWNER.password, id: ((await res.json()) as { data: { id: string } }).data.id }
}

export async function createAccount(page: Page, name: string, type = 'bank', opening = 100000) {
  const res = await page.request.post('/api/v1/accounts', {
    headers: HEADERS,
    data: { name, type, opening_balance: opening, opening_balance_date: '2026-01-01' },
  })
  expect(res.status(), await res.text()).toBe(201)
  return ((await res.json()) as { data: { id: string } }).data.id
}

export async function listTransactions(page: Page) {
  const res = await page.request.get('/api/v1/transactions?per_page=200')
  expect(res.status()).toBe(200)
  return ((await res.json()) as { data: Array<{ id: string; amount: number; client_id?: string }> }).data
}

/** Waits until the page is controlled by an active service worker. */
export async function waitForServiceWorker(page: Page) {
  // `ready` resolves once a worker is active; `evaluate` awaits the promise.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  if (await page.evaluate(() => !navigator.serviceWorker.controller)) {
    // The first load is not controlled yet; a reload picks the worker up.
    await page.reload()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  }
}
