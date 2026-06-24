import { Elysia } from 'elysia'
import { sql } from 'drizzle-orm'
import { db } from '../../db'

export function createHealthRoutes() {
  return new Elysia().get('/health', async () => {
    await db.execute(sql`select 1`)

    return {
      ok: true,
      service: 'vpn-backend',
      version: '0.1.0'
    }
  })
}
