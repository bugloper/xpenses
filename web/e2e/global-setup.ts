import { request } from '@playwright/test'
import { E2E_BASE_URL } from '../playwright.config'
import { ensureOwner } from './helpers'

export default async function globalSetup() {
  const ctx = await request.newContext({ baseURL: E2E_BASE_URL })
  await ensureOwner(ctx)
  await ctx.dispose()
}
