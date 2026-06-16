import { Pool } from 'pg'

const migrationId = '0000_initial'
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

  const applied = await pool.query<{ id: string }>('select id from schema_migrations where id = $1', [migrationId])

  if (applied.rowCount === 0) {
    const sql = await Bun.file(new URL('../../drizzle/0000_initial.sql', import.meta.url)).text()
    await pool.query('begin')
    await pool.query(sql)
    await pool.query('insert into schema_migrations (id) values ($1)', [migrationId])
    await pool.query('commit')
    console.log(`Applied migration ${migrationId}`)
  } else {
    console.log(`Migration ${migrationId} already applied`)
  }
} catch (error) {
  await pool.query('rollback').catch(() => undefined)
  throw error
} finally {
  await pool.end()
}
