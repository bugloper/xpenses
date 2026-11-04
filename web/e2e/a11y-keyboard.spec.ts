import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createAccount, loginAs } from './helpers'

const PAGES = [
  '/',
  '/transactions',
  '/accounts',
  '/categories',
  '/budgets',
  '/reports',
  '/settings',
]

test.describe('accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await loginAs(page)
    await createAccount(page, 'A11y account', 'bank', 1000)
  })

  for (const path of PAGES) {
    test(`axe: no serious or critical violations on ${path}`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading').first()).toBeVisible()
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(
        blocking.map(
          (v) =>
            `${v.id} (${v.impact}): ${v.nodes
              .map((n) => n.target.join(' '))
              .slice(0, 3)
              .join(', ')}`,
        ),
      ).toEqual([])
    })
  }

  test('axe: sign-in page', async ({ page }) => {
    await page.request.post('/api/v1/auth/logout', { headers: { 'X-Xpensiv-Client': 'e2e' } })
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([])
  })

  test('keyboard: open the add sheet with Enter, close with Escape, focus returns', async ({ page }) => {
    await page.goto('/')
    const add = page.getByRole('button', { name: 'Add transaction' }).first()
    await add.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Add transaction' })).toBeVisible()
    await expect(page.getByLabel('Amount')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Add transaction' })).toBeHidden()
    await expect(add).toBeFocused()
  })

  test('keyboard: dialogs trap focus and Tab cycles inside them', async ({ page }) => {
    await page.goto('/accounts')
    await page.getByRole('button', { name: /^New$/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab')
    const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
    expect(inside).toBe(true)
  })
})
