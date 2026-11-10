import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/notes',
  outputDir: 'artifacts/notes-test-results',
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://127.0.0.1:5178', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'mobile',
      use: {
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'narrow',
      use: {
        viewport: { width: 320, height: 740 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5178',
    url: 'http://127.0.0.1:5178',
    reuseExistingServer: false,
    env: { VITE_SHARE_MODE: 'demo', VITE_SHARE_STAGE: 'local' },
  },
})
