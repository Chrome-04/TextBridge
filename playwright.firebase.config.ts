import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/firebase',
  outputDir: 'artifacts/firebase-test-results',
  workers: 1,
  timeout: 90_000,
  use: { baseURL: 'http://127.0.0.1:5175', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 5175',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: false,
    env: { VITE_SHARE_MODE: 'firebase' },
  },
})
