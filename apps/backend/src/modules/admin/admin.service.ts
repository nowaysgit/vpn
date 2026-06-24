import type { AdminAuditEntry, AdminUserListItem } from '@vpn/api-contract'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db, type DbExecutor } from '../../db'
import { adminActionLogs, plans, subscriptions, users, vpnNodes } from '../../db/schema'
import { MVP_PROTOCOLS, type User } from '../../lib/domain'
import { createId } from '../../lib/id'
import { now } from '../../lib/time'
import { requireEntity } from '../../services/entity.service'
import { activeDevices, customerProfile, revokeUserDevices } from '../customer/customer.service'
import { grantSubscription } from '../subscriptions/subscriptions.service'

export async function listAdminUsers(): Promise<AdminUserListItem[]> {
  const rows = await db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt))
  return Promise.all(rows.map((user) => adminUser(user)))
}

export async function grantUserSubscription(admin: User, userId: string, planId: string) {
  const user = requireEntity(
    (
      await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    )[0],
    'User not found'
  )
  const plan = requireEntity(
    (
      await db
        .select()
        .from(plans)
        .where(eq(plans.id, planId))
        .limit(1)
    )[0],
    'Plan not found'
  )

  await db.transaction(async (tx) => {
    await grantSubscription(user.id, plan, admin.id, tx)
    await audit(tx, admin.id, 'subscription.grant', 'user', user.id)
  })

  return customerProfile(user)
}

export async function blockUser(admin: User, userId: string): Promise<AdminUserListItem> {
  const user = requireEntity(
    (
      await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    )[0],
    'User not found'
  )
  await revokeUserDevices(user)
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ blocked: true })
      .where(eq(users.id, user.id))
    await tx
      .update(subscriptions)
      .set({ status: 'blocked' })
      .where(and(eq(subscriptions.userId, user.id), inArray(subscriptions.status, ['active', 'grace', 'traffic_over_limit'])))
    await audit(tx, admin.id, 'user.block', 'user', user.id)
  })

  return adminUser({
    ...user,
    blocked: true
  })
}

export async function updateUserNotes(admin: User, userId: string, notes: string): Promise<AdminUserListItem> {
  const user = requireEntity(
    (
      await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    )[0],
    'User not found'
  )
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ notes })
      .where(eq(users.id, user.id))
    await audit(tx, admin.id, 'user.notes.update', 'user', user.id)
  })

  return adminUser({
    ...user,
    notes
  })
}

export async function listAdminAudit(): Promise<AdminAuditEntry[]> {
  const rows = await db
    .select({
      entry: adminActionLogs,
      actorEmail: users.email
    })
    .from(adminActionLogs)
    .leftJoin(users, eq(users.id, adminActionLogs.actorUserId))
    .orderBy(desc(adminActionLogs.createdAt))

  return rows.map(({ entry, actorEmail }): AdminAuditEntry => ({
    id: entry.id,
    actorEmail: actorEmail ?? 'unknown',
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    createdAt: entry.createdAt.toISOString()
  }))
}

export async function listAdminServers() {
  const nodes = await db.select().from(vpnNodes)
  return nodes.map((node) => ({
    ...node,
    protocols: node.provider === 'manual-external' ? ['external-manual'] : MVP_PROTOCOLS,
    visibleToCustomer: false
  }))
}

async function adminUser(user: User): Promise<AdminUserListItem> {
  const profile = await customerProfile(user)

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    subscriptionStatus: profile.subscriptionStatus,
    subscriptionEndsAt: profile.subscriptionEndsAt,
    trafficUsedGb: profile.trafficUsedGb,
    trafficLimitGb: profile.trafficLimitGb,
    deviceCount: (await activeDevices(user.id)).length,
    notes: user.notes
  }
}

async function audit(executor: DbExecutor, actorUserId: string, action: string, targetType: string, targetId: string): Promise<void> {
  await executor.insert(adminActionLogs).values({
    id: createId('audit'),
    actorUserId,
    action,
    targetType,
    targetId,
    createdAt: now()
  })
}
