import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.PORTFOLIO_BASE_URL;
const baseURL = process.env.PORTFOLIO_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? 'github' : 'list',

  use: {
    baseURL,
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },

  projects: [
    {
      name: 'api',
      testMatch: 'tests/api/**/*.spec.ts',
      // No browser needed for API tests
      use: {},
    },
    {
      name: 'chromium',
      testMatch: 'tests/ui/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start the portfolio dev server locally; skipped in CI (PORTFOLIO_BASE_URL points to preview)
  webServer: isCI
    ? undefined
    : {
        command: 'pnpm --filter portfolio dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
