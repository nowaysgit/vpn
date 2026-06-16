import { defineConfig, devices } from '@playwright/test'

const useManagedWebServers = process.env.PLAYWRIGHT_SKIP_WEBSERVER !== '1'

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'output/playwright/test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'output/playwright/report', open: 'never' }]
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: useManagedWebServers
    ? [
        {
          command: 'bun run --cwd apps/backend start',
          url: 'http://127.0.0.1:3001/health',
          reuseExistingServer: true,
          timeout: 120_000,
          env: {
            NODE_ENV: 'test',
            PORT: '3001',
            JWT_ACCESS_SECRET: 'test-secret',
            CREDENTIAL_ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000000'
          }
        },
        {
          command: 'bun run --cwd apps/customer-web serve:built',
          url: 'http://127.0.0.1:3000',
          reuseExistingServer: true,
          timeout: 180_000,
          env: {
            NODE_ENV: 'test',
            HOST: '0.0.0.0',
            PORT: '3000',
            API_BASE_URL: 'http://127.0.0.1:3001'
          }
        },
        {
          command: 'bun run --cwd apps/admin-web serve:built',
          url: 'http://127.0.0.1:3002',
          reuseExistingServer: true,
          timeout: 180_000,
          env: {
            NODE_ENV: 'test',
            HOST: '0.0.0.0',
            PORT: '3002',
            API_BASE_URL: 'http://127.0.0.1:3001'
          }
        }
      ]
    : undefined
})
