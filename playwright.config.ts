import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:8788',
    channel: process.env.CI ? undefined : 'chrome',
    locale: 'zh-CN',
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'dark',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command:
      'npm run start -- --port 8788 --var BETTER_AUTH_URL:http://127.0.0.1:8788 --var BETTER_AUTH_SECRET:e2e-only-synthetic-auth-secret-000000',
    url: 'http://127.0.0.1:8788/?workspace=1',
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
