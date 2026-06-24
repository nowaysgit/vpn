import { defineConfig, devices } from '@playwright/test'

const useManagedWebServers = process.env.PLAYWRIGHT_SKIP_WEBSERVER !== '1'
const apiBaseUrl = process.env.API_E2E_URL ?? 'http://127.0.0.1:3001'
const customerBaseUrl = process.env.CUSTOMER_E2E_URL ?? 'http://127.0.0.1:3000'
const adminBaseUrl = process.env.ADMIN_E2E_URL ?? 'http://127.0.0.1:3002'
const databaseUrl = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/vpn_test'
const apiPort = new URL(apiBaseUrl).port || '80'
const customerPort = new URL(customerBaseUrl).port || '80'
const adminPort = new URL(adminBaseUrl).port || '80'

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
          command: 'bun run --cwd apps/backend migrate && bun run --cwd apps/backend start',
          url: `${apiBaseUrl}/health`,
          reuseExistingServer: true,
          timeout: 120_000,
          env: {
            NODE_ENV: 'test',
            PORT: apiPort,
            DATABASE_URL: databaseUrl,
            API_PUBLIC_URL: apiBaseUrl,
            APP_PUBLIC_URL: customerBaseUrl,
            JWT_ACCESS_SECRET: 'test-secret',
            CREDENTIAL_ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000000',
            EMAIL_PROVIDER: 'outbox',
            EMAIL_DEV_OUTBOX_PATH: 'output/email-outbox.jsonl'
          }
        },
        {
          command: 'bun run --cwd apps/customer-web serve:built',
          url: customerBaseUrl,
          reuseExistingServer: true,
          timeout: 180_000,
          env: {
            NODE_ENV: 'test',
            HOST: '0.0.0.0',
            PORT: customerPort,
            NUXT_PUBLIC_API_BASE_URL: apiBaseUrl
          }
        },
        {
          command: 'bun run --cwd apps/admin-web serve:built',
          url: adminBaseUrl,
          reuseExistingServer: true,
          timeout: 180_000,
          env: {
            NODE_ENV: 'test',
            HOST: '0.0.0.0',
            PORT: adminPort,
            NUXT_PUBLIC_API_BASE_URL: apiBaseUrl
          }
        }
      ]
    : undefined
})
