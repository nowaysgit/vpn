import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'

type SeedModule = typeof import('../src/db/seed')

const databaseUrl = process.env.TEST_DATABASE_URL
const testIf = databaseUrl ? test : test.skip
let seedModule: SeedModule | null = null

describe('postgres database integration', () => {
  testIf('applies migrations and seeds production source-of-truth rows', async () => {
    await resetDatabase()
    const { runSeed } = await loadSeedModule()
    await runSeed()

    await withPool(async (pool) => {
      const plans = await pool.query<{ id: string }>('select id from plans order by id')
      const nodes = await pool.query<{ provider: string }>('select provider from vpn_nodes order by provider')
      const owners = await pool.query<{ email: string }>("select email from users where role = 'owner'")

      expect(plans.rows.map((plan) => plan.id)).toEqual(['plan_plus', 'plan_starter'])
      expect(nodes.rows.map((node) => node.provider)).toEqual(['manual-external', 'marzban'])
      expect(owners.rows[0]?.email).toBe('owner@vpn.local')
    })
  })
})

async function loadSeedModule(): Promise<SeedModule> {
  const connectionString = testDatabaseUrl()
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = connectionString
  seedModule ??= await import('../src/db/seed')
  return seedModule
}

async function resetDatabase(): Promise<void> {
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
