import { Elysia, t } from 'elysia'
import { requireUser } from '../../services/access-control.service'
import { createPaymentInvoice, paymentSignature, processPaymentWebhook } from './payments.service'

export function createPaymentsRoutes() {
  return new Elysia()
    .post(
      '/payments/create',
      async ({ headers, body }) => {
        const user = await requireUser(headers.authorization)
        return createPaymentInvoice(user, body)
      },
      {
        body: t.Object({
          planId: t.String(),
          provider: t.Optional(t.Union([t.Literal('tbank'), t.Literal('platega')])),
          idempotencyKey: t.Optional(t.String())
        })
      }
    )
    .post('/payments/webhooks/tbank', async ({ body, headers }) => {
      await processPaymentWebhook('tbank', body, paymentSignature(headers))
      return 'OK'
    })
    .post('/payments/webhooks/platega', async ({ body, headers }) => {
      const result = await processPaymentWebhook('platega', body, paymentSignature(headers))
      return result
    })
}
