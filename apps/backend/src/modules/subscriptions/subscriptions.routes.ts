import { Elysia } from 'elysia'
import { getSubscriptionProfileText } from './subscriptions.service'

export function createSubscriptionsRoutes() {
  return new Elysia().get('/sub/:token', async ({ params, set }) => {
    set.headers['content-type'] = 'text/plain; charset=utf-8'
    return getSubscriptionProfileText(params.token)
  })
}
