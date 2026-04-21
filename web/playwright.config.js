import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests hit the Vite dev server (default http://localhost:5173) which proxies /api → API.
 * Start the API first: `docker compose up -d` (api on :4000) or `cd api && npm run dev`.
 *
 * Override base URL (e.g. Docker web on :8080): PLAYWRIGHT_BASE_URL=http://localhost:8080 npm run test:e2e
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
/** Set to `0` when testing against Docker web (e.g. :8080) — start web + API yourself */
const startVite = process.env.PLAYWRIGHT_WEB_SERVER !== '0';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(startVite
    ? {
        webServer: {
          command: 'npm run dev',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }
    : {}),
});
