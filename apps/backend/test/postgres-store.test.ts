import { afterAll, describe, expect, test } from 'bun:test'
import { Pool } from 'pg'
import { createApp } from '../src/app'
import { createPostgresStore } from '../src/lib/postgres-store'

const databaseUrl = process.env.TEST_DATABASE_URL
const testIf = databaseUrl ? test : test.skip
const pools: Pool[] = []

describe('postgres store integration', () => {
  afterAll(async () => {
    await Promise.all(pools.map((pool) => pool.end()))
  })

  testIf('seeds core rows and persists registration changes', async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required')
    const pool = new Pool({ connectionString: databaseUrl })
    pools.push(pool)

    await resetDatabase(pool)
    await runInitialMigration(pool)

    const store = await createPostgresStore({ pool })
    const { app } = await createApp({ store })

    const registered = await json<{ userId: string; verificationEmailSent: boolean }>(
      app.handle(request('POST', '/auth/register', { email: 'pg@example.com', name: 'PG User', password: 'password123' }))
    )
    const verificationToken = store.emailTokens.find((item) => item.userId === registered.userId)?.token
    expect(registered.verificationEmailSent).toBe(true)
    if (!verificationToken) throw new Error('Verification token was not created')
    expect(verificationToken).toStartWith('verify_')
    await json(app.handle(request('POST', '/auth/verify-email', { token: verificationToken })))

    const persisted = await pool.query<{ email: string; email_verified: boolean }>(
      'select email, email_verified from users where email = $1',
      ['pg@example.com']
    )

    expect(persisted.rows[0]?.email).toBe('pg@example.com')
    expect(persisted.rows[0]?.email_verified).toBe(true)
    expect(store.plans.map((plan) => plan.id)).toContain('plan_starter')
    expect(store.nodes.map((node) => node.provider)).toContain('manual-external')
  })
})

async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query('drop schema public cascade')
  await pool.query('create schema public')
}

async function runInitialMigration(pool: Pool): Promise<void> {
  for (const file of ['0000_initial.sql', '0001_tbank_payment_provider.sql']) {
    const sql = await Bun.file(new URL(`../drizzle/${file}`, import.meta.url)).text()
    await pool.query(sql)
  }
}

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
