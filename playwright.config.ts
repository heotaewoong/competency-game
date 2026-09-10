import { defineConfig, devices } from '@playwright/test';

const externalBaseURL = process.env.BASE_URL;
const localBaseURL = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // The timer-heavy game flows share one production server. Running them in
  // parallel makes animation and countdown assertions measure host contention
  // instead of product behavior, especially when Chromium and WebKit overlap.
  workers: 1,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: externalBaseURL ?? localBaseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: 'npm run build && npm run start -- --hostname 127.0.0.1 --port 4173',
        url: localBaseURL,
        reuseExistingServer: false,
        timeout: process.env.CI ? 180_000 : 600_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/mobile-webkit.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-safari',
      testMatch: '**/mobile-webkit.spec.ts',
      use: {
        ...devices['iPhone 13'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
