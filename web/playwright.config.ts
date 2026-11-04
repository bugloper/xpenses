import { defineConfig, devices } from '@playwright/test'

// Smoke tests expect the Vite dev server (and the Go API behind the /api proxy)
// to be reachable at E2E_BASE_URL. They skip themselves when the server is down.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }],
})
