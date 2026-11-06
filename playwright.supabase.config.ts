import { defineConfig } from '@playwright/test'
process.env.TEXTBRIDGE_BROWSER_URL = 'http://127.0.0.1:5176'
export default defineConfig({
  testDir: './tests/firebase',
  outputDir: 'artifacts/supabase-test-results',
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL: process.env.TEXTBRIDGE_BROWSER_URL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev --port 5176',
    url: process.env.TEXTBRIDGE_BROWSER_URL,
    reuseExistingServer: false,
    env: { VITE_SHARE_MODE: 'supabase' },
  },
})
