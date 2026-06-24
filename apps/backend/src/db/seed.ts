import { count, eq } from 'drizzle-orm'
import { db } from '.'
import { createId, createToken } from '../lib/id'
import { hashPassword } from '../lib/security'
import { plans, users, vpnNodes } from './schema'

const seedPlans = [
  {
    id: 'plan_starter',
    code: 'starter',
    title: 'Starter',
    priceRub: 299,
    durationDays: 30,
    trafficLimitGb: 200,
    deviceLimit: 4
  },
  {
    id: 'plan_plus',
    code: 'plus',
    title: 'Plus',
    priceRub: 499,
    durationDays: 30,
    trafficLimitGb: 500,
    deviceLimit: 4
  }
]

const seedNodes = [
  {
    id: 'node_irkutsk_1',
    name: 'Irkutsk 1',
    locationCode: 'irk',
    provider: 'marzban',
    publicHost: 'irk-1.vpn.local',
    enabled: true
  },
  {
    id: 'node_external_fallback',
    name: 'External fallback',
    locationCode: 'fallback',
    provider: 'manual-external',
    publicHost: 'fallback.vpn.local',
    enabled: true
  }
]

export async function runSeed(): Promise<void> {
  await db
    .insert(plans)
    .values(seedPlans)
    .onConflictDoNothing()

  await db
    .insert(vpnNodes)
    .values(seedNodes)
    .onConflictDoNothing()

  const [ownerCount] = await db.select({ count: count() }).from(users).where(eq(users.role, 'owner'))
  if ((ownerCount?.count ?? 0) > 0) return

  await db.insert(users).values({
    id: createId('usr'),
    email: process.env.SEED_ADMIN_EMAIL ?? 'owner@vpn.local',
    name: 'Owner',
    passwordHash: await hashPassword(process.env.SEED_ADMIN_PASSWORD ?? 'changeme'),
    emailVerified: true,
    role: 'owner',
    blocked: false,
    notes: null,
    subscriptionToken: createToken('subtok'),
    createdAt: new Date()
  })
}
