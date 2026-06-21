import { Pool } from 'pg'
import { fileURLToPath } from 'node:url'

const connectionString = process.env.DATABASE_URL

if (!connectionString) throw new Error('DATABASE_URL is required to run migrations')

const pool = new Pool({ connectionString })

try {
  await pool.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `)

  const migrationDir = fileURLToPath(new URL('../../drizzle', import.meta.url))
  const migrationFiles: string[] = []

  for await (const file of new Bun.Glob('*.sql').scan({ cwd: migrationDir })) {
    migrationFiles.push(file)
  }

  for (const file of migrationFiles.sort()) {
    const migrationId = file.replace(/\.sql$/, '')
    const applied = await pool.query<{ id: string }>('select id from schema_migrations where id = $1', [migrationId])

    if (applied.rowCount !== 0) {
      console.log(`Migration ${migrationId} already applied`)
      continue
    }

    const sql = await Bun.file(new URL(`../../drizzle/${file}`, import.meta.url)).text()
    await pool.query('begin')
    await pool.query(sql)
    await pool.query('insert into schema_migrations (id) values ($1)', [migrationId])
    await pool.query('commit')
    console.log(`Applied migration ${migrationId}`)
  }
} catch (error) {
  await pool.query('rollback').catch(() => undefined)
  throw error
} finally {
  await pool.end()
}
