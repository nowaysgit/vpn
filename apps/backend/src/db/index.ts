import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL ?? (process.env.NODE_ENV === 'test' ? process.env.TEST_DATABASE_URL : undefined)

if (!connectionString) throw new Error('DATABASE_URL is required')

export const pool = new Pool({ connectionString })
export const db = drizzle(pool, { schema })

export type Database = typeof db
export type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
export type DbExecutor = Database | DbTransaction

export async function closeDb(): Promise<void> {
  await pool.end()
}
