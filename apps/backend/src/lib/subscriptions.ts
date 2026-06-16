import type { Plan, Subscription } from './domain'
import { GRACE_PERIOD_DAYS } from './domain'
import { addDays, gbToBytes } from './time'
import { createId } from './id'

export function createSubscription(input: {
  userId: string
  plan: Plan
  startsAt: Date
  grantedByAdminId?: string | null
}): Subscription {
  const endsAt = addDays(input.startsAt, input.plan.durationDays)

  return {
    id: createId('sub'),
    userId: input.userId,
    planId: input.plan.id,
    status: 'active',
    startsAt: input.startsAt,
    endsAt,
    graceEndsAt: addDays(endsAt, GRACE_PERIOD_DAYS),
    trafficUsedBytes: 0n,
    trafficLimitBytes: gbToBytes(input.plan.trafficLimitGb),
    grantedByAdminId: input.grantedByAdminId ?? null
  }
}

export function evaluateSubscriptionStatus(subscription: Subscription, at: Date): Subscription['status'] {
  if (subscription.status === 'blocked') return 'blocked'
  if (subscription.trafficUsedBytes >= subscription.trafficLimitBytes) return 'traffic_over_limit'
  if (at <= subscription.endsAt) return 'active'
  if (at <= subscription.graceEndsAt) return 'grace'
  return 'expired'
}

export function addTraffic(subscription: Subscription, bytes: bigint): Subscription {
  return {
    ...subscription,
    trafficUsedBytes: subscription.trafficUsedBytes + bytes
  }
}
