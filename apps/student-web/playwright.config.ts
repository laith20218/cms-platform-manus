import { defineConfig, devices } from '@playwright/test';

// Default target: production student-web on Vercel.
// For local dev testing: E2E_WEB_URL=http://127.0.0.1:5173 npx playwright test
const baseURL = process.env.E2E_WEB_URL ?? 'https://cms-platform-manus-student-web.vercel.app';

// Playwright bundles its own Chromium; use that instead of /usr/bin/chromium
// (which may not exist on all CI/sandbox environments).
const chromiumExecutable =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    // Allow cross-origin API calls to Render backend
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: chromiumExecutable,
          args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        },
      },
    },
  ],
});
