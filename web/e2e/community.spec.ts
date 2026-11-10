import { expect, test } from '@playwright/test'
import { HEADERS, loginAs, loginAsNewUser } from './helpers'

// A user asks for help; the administrator answers from the console; the answer
// shows on the user's Feedback & support page.
test('support message and the administrator reply', async ({ page }) => {
  await page.goto('/')
  const user = await loginAsNewUser(page, 'Helpme')
  await page.goto('/help')
  await expect(page.getByRole('heading', { name: 'Feedback & support' })).toBeVisible()
  await page.getByRole('tab', { name: 'Support' }).click()
  const message = `My mPay screenshot was not read ${Date.now()}`
  await page.getByLabel('Message').fill(message)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Sent. The administrator will get back to you.')).toBeVisible()
  await expect(page.getByText(message)).toBeVisible()

  await page.request.post('/api/v1/auth/logout', { headers: HEADERS })
  await loginAs(page)
  await page.goto('/admin?tab=feedback')
  const item = page.getByRole('listitem').filter({ hasText: message })
  await item.getByRole('button', { name: 'Reply' }).click()
  await item.getByLabel('Reply to Helpme').fill('Fixed in today’s update.')
  await item.getByRole('button', { name: 'Send reply' }).click()
  await expect(page.getByText('Reply sent')).toBeVisible()

  await page.request.post('/api/v1/auth/logout', { headers: HEADERS })
  await loginAs(page, user.email, user.password)
  await page.goto('/help')
  const sent = page.getByRole('listitem').filter({ hasText: message })
  await expect(sent).toContainText('Fixed in today’s update.')
  await expect(sent).toContainText('Replied')
})

// A testimonial reaches the public home page only after approval.
test('testimonial is approved onto the home page', async ({ page, browser }) => {
  await page.goto('/')
  const name = `Quoted ${Date.now()}`
  await loginAsNewUser(page, name)
  await page.goto('/help')
  const words = `Every ngultrum in one place, finally ${Date.now()}`
  await page.getByLabel('In your words').fill(words)
  await page.getByRole('button', { name: 'Submit for review' }).click()
  await expect(page.getByText('Waiting for review')).toBeVisible()

  await page.request.post('/api/v1/auth/logout', { headers: HEADERS })
  await loginAs(page)
  await page.goto('/admin?tab=testimonials')
  await page.getByRole('listitem').filter({ hasText: words }).getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('Approved: it is on the home page')).toBeVisible()

  const visitor = await browser.newPage()
  await visitor.goto('/')
  await expect(visitor.getByRole('heading', { name: 'From people keeping their book' })).toBeVisible()
  await expect(visitor.getByText(words)).toBeVisible()
  await expect(visitor.getByText(name, { exact: true })).toBeVisible()
  await visitor.close()
})
