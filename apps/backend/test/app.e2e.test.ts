import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import type { EmailSender, VerificationEmailInput } from '../src/lib/email'
import { addDays } from '../src/lib/time'

type AppModule = typeof import('../src/app')
type App = Awaited<ReturnType<AppModule['createApp']>>['app']

type RegisterResponse = {
  userId: string
  email: string
  verificationEmailSent: boolean
  resendAvailableAt: string
}

type LoginResponse = {
  token: string
  user: {
    id: string
    email: string
  }
}

type InvoiceResponse = {
  id: string
  provider: 'tbank' | 'platega'
  amountRub: number
  checkoutUrl: string
}

type DeviceResponse = {
  id: string
  label: string
  protocols: string[]
}

type DeviceLimitResponse = {
  code: string
  replaceRequired: boolean
  devices: DeviceResponse[]
}

const databaseUrl = process.env.TEST_DATABASE_URL
const testIf = databaseUrl ? test : test.skip
let appModule: AppModule | null = null

describe('backend API e2e', () => {
  testIf('registers, verifies, pays and exposes one subscription URL with all MVP protocols', async () => {
    const { app, codeFor } = await createTestApp()
    const registered = await json<RegisterResponse>(
      app.handle(request('POST', '/auth/register', { email: 'user@example.com', name: 'User', password: 'password123' }))
    )

    expect(registered.verificationEmailSent).toBe(true)
    expect('verificationToken' in registered).toBe(false)
    expect(registered.resendAvailableAt).toBeDefined()

    await json(app.handle(request('POST', '/auth/verify-email', { email: registered.email, code: codeFor(registered.email) })))
    const loggedIn = await json<LoginResponse>(
      app.handle(request('POST', '/auth/login', { email: 'user@example.com', password: 'password123' }))
    )
    const invoice = await json<InvoiceResponse>(
      app.handle(
        request('POST', '/payments/create', { planId: 'plan_starter', idempotencyKey: 'first-payment' }, loggedIn.token)
      )
    )
    expect(invoice.provider).toBe('tbank')

    await text(app.handle(request('POST', '/payments/webhooks/tbank', tBankPaidWebhook(invoice))))

    const device = await json<DeviceResponse>(app.handle(request('POST', '/me/devices', { label: 'Laptop' }, loggedIn.token)))
    expect(device.protocols).toEqual(['vless-reality', 'trojan-tls', 'shadowsocks'])

    const profile = await json<{ subscriptionUrl: string; subscriptionStatus: string }>(
      app.handle(request('GET', '/me/profile', undefined, loggedIn.token))
    )
    expect(profile.subscriptionStatus).toBe('active')

    const subscription = await text(app.handle(request('GET', profile.subscriptionUrl, undefined, loggedIn.token)))
    expect(subscription).toContain('vless://')
    expect(subscription).toContain('trojan://')
    expect(subscription).toContain('ss://')
  })

  testIf('keeps payment webhooks idempotent', async () => {
    const { app, codeFor } = await createTestApp()
    const token = await registeredVerifiedToken(app, codeFor, 'pay@example.com')
    const invoice = await json<InvoiceResponse>(
      app.handle(request('POST', '/payments/create', { planId: 'plan_starter', idempotencyKey: 'same-key' }, token))
    )

    const first = await text(app.handle(request('POST', '/payments/webhooks/tbank', tBankPaidWebhook(invoice))))
    const duplicate = await text(app.handle(request('POST', '/payments/webhooks/tbank', tBankPaidWebhook(invoice))))

    expect(first).toBe('OK')
    expect(duplicate).toBe('OK')
    expect(await scalar('select count(*) from payment_events')).toBe(1)
    expect(await scalar("select count(*) from subscriptions s join users u on u.id = s.user_id where u.email = 'pay@example.com'")).toBe(1)
  })

  testIf('links Telegram account to an existing web account', async () => {
    const { app, codeFor } = await createTestApp()
    const token = await registeredVerifiedToken(app, codeFor, 'telegram@example.com')
    const linkToken = await json<{ token: string }>(app.handle(request('POST', '/telegram/link-token', undefined, token)))

    const linked = await json<{ ok: boolean; email: string }>(
      app.handle(
        request('POST', '/telegram/link', {
          token: linkToken.token,
          telegramUserId: '12345',
          username: 'vpn_user'
        })
      )
    )
    const profile = await json<{ email: string; telegramUserId: string }>(
      app.handle(request('GET', '/telegram/profile/12345'))
    )

    expect(linked.ok).toBe(true)
    expect(linked.email).toBe('telegram@example.com')
    expect(profile.email).toBe('telegram@example.com')
    expect(profile.telegramUserId).toBe('12345')
  })

  testIf('requires explicit choice when adding a fifth device and then replaces selected device', async () => {
    const { app, codeFor } = await createTestApp()
    const token = await paidUserToken(app, codeFor, 'devices@example.com')
    const created: DeviceResponse[] = []

    for (const label of ['Phone', 'Laptop', 'Tablet', 'Router']) {
      created.push(await json<DeviceResponse>(app.handle(request('POST', '/me/devices', { label }, token))))
    }

    const fifthResponse = await app.handle(request('POST', '/me/devices', { label: 'Travel phone' }, token))
    const fifth = await json<DeviceLimitResponse>(fifthResponse)

    expect(fifthResponse.status).toBe(409)
    expect(fifth.replaceRequired).toBe(true)
    expect(fifth.devices).toHaveLength(4)

    const replacement = await json<DeviceResponse>(
      app.handle(
        request('POST', '/me/devices/replace', { replaceDeviceId: created[0]?.id, label: 'Travel phone' }, token)
      )
    )
    const devices = await json<DeviceResponse[]>(app.handle(request('GET', '/me/devices', undefined, token)))

    expect(replacement.label).toBe('Travel phone')
    expect(devices).toHaveLength(4)
    expect(devices.some((device) => device.label === 'Phone')).toBe(false)
  })

  testIf('revokes device credentials when a user deletes a device', async () => {
    const { app, codeFor } = await createTestApp()
    const token = await paidUserToken(app, codeFor, 'delete-device@example.com')
    const device = await json<DeviceResponse>(app.handle(request('POST', '/me/devices', { label: 'Old phone' }, token)))
    const profile = await json<{ subscriptionUrl: string }>(app.handle(request('GET', '/me/profile', undefined, token)))

    const beforeDelete = await text(app.handle(request('GET', profile.subscriptionUrl, undefined, token)))
    expect(beforeDelete).toContain('Old%20phone')

    await json(app.handle(request('DELETE', `/me/devices/${device.id}`, undefined, token)))
    const afterDelete = await text(app.handle(request('GET', profile.subscriptionUrl, undefined, token)))

    expect(afterDelete).toBe('')
  })

  testIf('falls back to an external manual provider when Marzban is unavailable', async () => {
    const { app, codeFor } = await createTestApp()
    await exec("update vpn_nodes set enabled = false where provider = 'marzban'")

    const token = await paidUserToken(app, codeFor, 'fallback@example.com')
    const device = await json<DeviceResponse>(
      app.handle(request('POST', '/me/devices', { label: 'Fallback laptop' }, token))
    )
    const profile = await json<{ subscriptionUrl: string }>(app.handle(request('GET', '/me/profile', undefined, token)))
    const subscription = await text(app.handle(request('GET', profile.subscriptionUrl, undefined, token)))

    expect(device.protocols).toEqual(['external-manual'])
    expect(subscription).toContain('https://fallback.vpn.local/sub/')
  })

  testIf('blocks provisioning after user-level traffic limit is reached', async () => {
    const { app, codeFor } = await createTestApp()
    const token = await paidUserToken(app, codeFor, 'traffic@example.com')
    await exec(
      "update subscriptions set traffic_used_bytes = traffic_limit_bytes where user_id = (select id from users where email = 'traffic@example.com')"
    )

    const response = await app.handle(request('POST', '/me/devices', { label: 'Blocked laptop' }, token))
    const body = await json<{ code: string; message: string }>(response)

    expect(response.status).toBe(402)
    expect(body.code).toBe('TRAFFIC_LIMIT_REACHED')
    expect(body.message).toContain('Buy extra traffic')
  })

  testIf('allows grace period for one day and expires after grace', async () => {
    const { app, codeFor } = await createTestApp()
    const token = await paidUserToken(app, codeFor, 'grace@example.com')

    await updateSubscriptionDates('grace@example.com', new Date(Date.now() - 12 * 60 * 60 * 1000), new Date(Date.now() + 12 * 60 * 60 * 1000))
    const graceDevice = await app.handle(request('POST', '/me/devices', { label: 'Grace device' }, token))
    expect(graceDevice.status).toBe(200)

    await updateSubscriptionDates('grace@example.com', addDays(new Date(), -2), addDays(new Date(), -1))
    const expiredDevice = await app.handle(request('POST', '/me/devices', { label: 'Expired device' }, token))
    expect(expiredDevice.status).toBe(403)
  })
})

function request(method: string, path: string, body?: unknown, token?: string): Request {
  const headers = new Headers()
  headers.set('content-type', 'application/json')
  if (token) headers.set('authorization', `Bearer ${token}`)
  const init: RequestInit = {
    method,
    headers
  }

  if (body !== undefined) init.body = JSON.stringify(body)

  return new Request(`http://localhost${path}`, init)
}

async function json<T = unknown>(responseOrPromise: Response | Promise<Response>): Promise<T> {
  const response = await responseOrPromise
  return (await response.json()) as T
}

async function text(responseOrPromise: Response | Promise<Response>): Promise<string> {
  const response = await responseOrPromise
  return response.text()
}

async function createTestApp(): Promise<Awaited<ReturnType<AppModule['createApp']>> & { codeFor: (email: string) => string }> {
  await resetTestDatabase()
  const { createApp } = await loadAppModule()
  const codes = new Map<string, string>()
  const emailSender: EmailSender = {
    async sendVerificationEmail(input: VerificationEmailInput): Promise<void> {
      codes.set(input.to, input.code)
    }
  }
  const app = await createApp({ emailSender })
  return {
    ...app,
    codeFor(email: string): string {
      const code = codes.get(email.trim().toLowerCase())
      if (!code) throw new Error(`Verification code for ${email} was not sent`)
      return code
    }
  }
}

async function registeredVerifiedToken(app: App, codeFor: (email: string) => string, email: string): Promise<string> {
  const registered = await json<RegisterResponse>(
    app.handle(request('POST', '/auth/register', { email, name: 'User', password: 'password123' }))
  )
  await json(app.handle(request('POST', '/auth/verify-email', { email: registered.email, code: codeFor(registered.email) })))
  const loggedIn = await json<LoginResponse>(app.handle(request('POST', '/auth/login', { email, password: 'password123' })))
  return loggedIn.token
}

async function paidUserToken(app: App, codeFor: (email: string) => string, email: string): Promise<string> {
  const token = await registeredVerifiedToken(app, codeFor, email)
  const invoice = await json<InvoiceResponse>(
    app.handle(request('POST', '/payments/create', { planId: 'plan_starter', idempotencyKey: `payment-${email}` }, token))
  )
  await text(app.handle(request('POST', '/payments/webhooks/tbank', tBankPaidWebhook(invoice))))
  return token
}

function tBankPaidWebhook(invoice: InvoiceResponse) {
  return {
    PaymentId: invoice.id,
    Status: 'CONFIRMED',
    Success: true,
    Amount: invoice.amountRub * 100
  }
}

async function loadAppModule(): Promise<AppModule> {
  const connectionString = testDatabaseUrl()
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = connectionString
  appModule ??= await import('../src/app')
  return appModule
}

async function resetTestDatabase(): Promise<void> {
  testDatabaseUrl()
  await withPool(async (pool) => {
    await pool.query('drop schema public cascade')
    await pool.query('create schema public')
    await pool.query(`
      create table schema_migrations (
        id text primary key,
        applied_at timestamptz not null default now()
      )
    `)

    const migrationDir = fileURLToPath(new URL('../drizzle', import.meta.url))
    const migrationFiles: string[] = []
    for await (const file of new Bun.Glob('*.sql').scan({ cwd: migrationDir })) {
      migrationFiles.push(file)
    }

    for (const file of migrationFiles.sort()) {
      const migrationId = file.replace(/\.sql$/, '')
      const sql = await Bun.file(new URL(`../drizzle/${file}`, import.meta.url)).text()
      await pool.query(sql)
      await pool.query('insert into schema_migrations (id) values ($1)', [migrationId])
    }
  })
}

async function exec(sql: string, values: unknown[] = []): Promise<void> {
  await withPool(async (pool) => {
    await pool.query(sql, values)
  })
}

async function scalar(sql: string, values: unknown[] = []): Promise<number> {
  return withPool(async (pool) => {
    const result = await pool.query<{ count: string }>(sql, values)
    return Number(result.rows[0]?.count ?? 0)
  })
}

async function updateSubscriptionDates(email: string, endsAt: Date, graceEndsAt: Date): Promise<void> {
  await exec(
    'update subscriptions set ends_at = $1, grace_ends_at = $2 where user_id = (select id from users where email = $3)',
    [endsAt, graceEndsAt, email]
  )
}

async function withPool<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: testDatabaseUrl() })
  try {
    return await fn(pool)
  } finally {
    await pool.end()
  }
}

function testDatabaseUrl(): string {
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required')
  return databaseUrl
}
