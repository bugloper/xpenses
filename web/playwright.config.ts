import { defineConfig, devices } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

// Self-contained end-to-end suite: Playwright starts the Go server serving the
// production build (web/dist) on a throwaway database, so service worker, PWA
// and offline behaviour are exercised exactly as deployed.
// Run `bun run build` first (or `bun run test:e2e`, which does).
export const E2E_PORT = 18090
export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${E2E_PORT}`
export const E2E_DATA_DIR = path.join(os.tmpdir(), `xpenses-e2e-${process.pid}`)

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    // Service workers must stay enabled for the PWA specs.
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Server output goes to a log file next to the throwaway database.
        command: `mkdir -p "${E2E_DATA_DIR}" && go run ./cmd/server > "${E2E_DATA_DIR}/server.log" 2>&1`,
        cwd: path.resolve(import.meta.dirname, '..'),
        url: `${E2E_BASE_URL}/api/v1/health`,
        timeout: 120_000,
        reuseExistingServer: false,
        env: {
          XPENSES_ADDR: `127.0.0.1:${E2E_PORT}`,
          XPENSES_DATA_DIR: E2E_DATA_DIR,
          XPENSES_STATIC_DIR: path.resolve(import.meta.dirname, 'dist'),
          XPENSES_CORS_ORIGIN: '',
          XPENSES_SECURE_COOKIES: 'false',
          XPENSES_LOG_LEVEL: 'warn',
        },
      },
})
