import { test, expect } from '@playwright/test'
import { HEADERS, OWNER, loginAs, loginAsNewUser, createAccount } from './helpers'

test.describe('authentication', () => {
  test('anonymous visitor is sent to sign in and back after login', async ({ page }) => {
    await page.goto('/transactions')
    await expect(page).toHaveURL(/\/login\?redirect=%2Ftransactions/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

    await page.getByLabel('Email').fill(OWNER.email)
    await page.getByLabel('Password').fill('definitely-wrong-pw')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText(/incorrect email or password/i)).toBeVisible()

    await page.getByLabel('Password').fill(OWNER.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/transactions$/)
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()
  })

  test('setup page is unavailable once an owner exists', async ({ page }) => {
    await page.goto('/setup')
    await expect(page).toHaveURL(/\/login/)
  })

  test('keyboard-only sign in', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').focus()
    await page.keyboard.type(OWNER.email)
    await page.keyboard.press('Tab')
    await page.keyboard.type(OWNER.password)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('log out clears the session and cached data', async ({ page, isMobile }) => {
    await loginAs(page)
    await page.goto('/accounts')
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
    if (isMobile) {
      await page.getByRole('button', { name: 'More' }).click()
      await page.getByRole('button', { name: 'Log out' }).click()
    } else {
      await page.getByRole('button', { name: /Signed in as/ }).click()
      await page.getByRole('menuitem', { name: 'Log out' }).click()
    }
    await expect(page).toHaveURL(/\/login/)
    const cached = await page.evaluate(() => localStorage.getItem('xpenses-query-cache'))
    expect(cached).toBeNull()
    const me = await page.request.get('/api/v1/auth/me')
    expect(me.status()).toBe(401)
  })

  test('users only see their own data', async ({ page, browser }) => {
    await loginAs(page)
    const ownerAcct = await createAccount(page, 'Owner secret account')

    const other = await browser.newContext()
    const otherPage = await other.newPage()
    await otherPage.goto('/')
    const user = await loginAsNewUser(otherPage, 'Second user')
    await otherPage.goto('/accounts')
    await expect(otherPage.getByRole('heading', { name: 'Accounts' })).toBeVisible()
    await expect(otherPage.getByText('Owner secret account')).toHaveCount(0)
    const direct = await otherPage.request.get(`/api/v1/accounts/${ownerAcct}`)
    expect(direct.status()).toBe(404)
    const admin = await otherPage.request.get('/api/v1/admin/users')
    expect(admin.status()).toBe(403)
    await otherPage.goto('/admin')
    await expect(otherPage).not.toHaveURL(/\/admin/)
    await other.close()
    expect(user.email).toContain('@example.com')
  })

  test('admin can invite and manage users', async ({ page }) => {
    await loginAs(page)
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible()
    await page
      .getByRole('button', { name: /invite/i })
      .first()
      .click()
    await expect(page.getByRole('heading', { name: 'New invite' })).toBeVisible()
    await page.getByRole('button', { name: 'Create invite' }).click()
    await expect(page.getByRole('heading', { name: 'Invite link' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Invite link' })).toHaveValue(
      /\/register\?invite=[0-9a-f]{64}$/,
    )
    const users = await page.request.get('/api/v1/admin/users', { headers: HEADERS })
    expect(users.status()).toBe(200)
  })
})
