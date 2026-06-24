import { Elysia } from 'elysia'
import { listPublicPlans } from './plans.service'

export function createPlansRoutes() {
  return new Elysia().get('/plans', () => listPublicPlans())
}
