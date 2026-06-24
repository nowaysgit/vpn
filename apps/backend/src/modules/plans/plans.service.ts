import type { PublicPlan } from '@vpn/api-contract'
import { asc } from 'drizzle-orm'
import { db } from '../../db'
import { plans } from '../../db/schema'
import type { Plan } from '../../lib/domain'

export async function listPublicPlans(): Promise<PublicPlan[]> {
  const rows = await db.select().from(plans).orderBy(asc(plans.priceRub))
  return rows.map(publicPlan)
}

export function publicPlan(plan: Plan): PublicPlan {
  return {
    id: plan.id,
    code: plan.code,
    title: plan.title,
    priceRub: plan.priceRub,
    durationDays: plan.durationDays,
    trafficLimitGb: plan.trafficLimitGb,
    deviceLimit: plan.deviceLimit
  }
}
