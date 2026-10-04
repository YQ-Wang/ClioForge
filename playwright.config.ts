import { defineConfig } from '@playwright/test';

const port = process.env.E2E_PORT || '8788';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    channel: process.env.CI ? undefined : 'chrome',
    locale: 'zh-CN',
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'dark',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run start -- --port ${port} --var BETTER_AUTH_URL:${baseURL} --var BETTER_AUTH_SECRET:e2e-only-synthetic-auth-secret-000000`,
    url: `${baseURL}/?workspace=1`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
