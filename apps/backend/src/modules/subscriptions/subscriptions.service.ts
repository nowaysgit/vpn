import type { SubscriptionStatus } from '@vpn/api-contract'
import type { Plan, Subscription } from '../../lib/domain'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db, type DbExecutor } from '../../db'
import { deviceCredentials, plans, subscriptions, users } from '../../db/schema'
import { AppError } from '../../lib/errors'
import { decryptJson } from '../../lib/security'
import { createSubscription, evaluateSubscriptionStatus } from '../../lib/subscriptions'
import { now } from '../../lib/time'
import { requireEntity } from '../../services/entity.service'

const activeLikeStatuses: SubscriptionStatus[] = ['active', 'grace', 'traffic_over_limit']

export async function currentSubscription(userId: string): Promise<Subscription | null> {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.endsAt))
    .limit(1)

  if (!subscription) return null
  return updateEvaluatedSubscriptionStatus(subscription)
}

export async function requireUsableSubscription(userId: string): Promise<Subscription> {
  const subscription = await currentSubscription(userId)
  if (!subscription) throw new AppError('AUTH_REQUIRED', 'Active subscription is required', 403)
  if (subscription.status === 'traffic_over_limit') {
    throw new AppError('TRAFFIC_LIMIT_REACHED', 'Traffic limit reached. Buy extra traffic or renew the plan.', 402)
  }
  if (!isUsableStatus(subscription.status)) {
    throw new AppError('AUTH_REQUIRED', 'Subscription is not active', 403)
  }
  return subscription
}

export async function grantSubscription(userId: string, plan: Plan, adminId: string | null, executor: DbExecutor = db): Promise<Subscription> {
  await executor
    .update(subscriptions)
    .set({ status: 'expired' })
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, activeLikeStatuses)))

  const subscription = createSubscription({
    userId,
    plan,
    startsAt: now(),
    grantedByAdminId: adminId
  })

  await executor.insert(subscriptions).values(subscription)
  return subscription
}

export async function getSubscriptionProfileText(token: string): Promise<string> {
  const user = requireEntity(
    (
      await db
        .select()
        .from(users)
        .where(eq(users.subscriptionToken, token))
        .limit(1)
    )[0],
    'Subscription token not found'
  )
  await requireUsableSubscription(user.id)

  const credentials = await db
    .select()
    .from(deviceCredentials)
    .where(and(eq(deviceCredentials.userId, user.id), isNull(deviceCredentials.revokedAt)))

  return credentials
    .flatMap((credential) => decryptJson<{ uri: string }[]>(credential.encryptedPayload))
    .map((profile) => profile.uri)
    .join('\n')
}

export async function subscriptionDeviceLimit(subscription: Subscription): Promise<number> {
  const [plan] = await db
    .select({ deviceLimit: plans.deviceLimit })
    .from(plans)
    .where(eq(plans.id, subscription.planId))
    .limit(1)
  return plan?.deviceLimit ?? 4
}

async function updateEvaluatedSubscriptionStatus(subscription: Subscription): Promise<Subscription> {
  const status = evaluateSubscriptionStatus(subscription, now())
  if (status === subscription.status) return subscription

  await db
    .update(subscriptions)
    .set({ status })
    .where(eq(subscriptions.id, subscription.id))

  return {
    ...subscription,
    status
  }
}

function isUsableStatus(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'grace'
}
