import { afterEach, describe, expect, test } from 'bun:test'
import { createWebhookSignature, PlategaPaymentAdapter } from '../src/lib/payments'

const originalEnv = { ...process.env }

describe('payment providers', () => {
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test('accepts signed webhooks when provider secret is configured', () => {
    process.env.NODE_ENV = 'development'
    process.env.PLATEGA_SECRET = 'provider-secret'
    const payload = {
      paymentId: 'pay_1',
      eventId: 'evt_1',
      status: 'paid'
    }
    const signature = createWebhookSignature(payload, 'provider-secret')

    const parsed = new PlategaPaymentAdapter().parseWebhook(payload, signature)

    expect(parsed.providerPaymentId).toBe('pay_1')
    expect(parsed.status).toBe('paid')
  })

  test('rejects webhooks with an invalid signature', () => {
    process.env.NODE_ENV = 'development'
    process.env.PLATEGA_SECRET = 'provider-secret'
    const payload = {
      paymentId: 'pay_1',
      eventId: 'evt_1',
      status: 'paid'
    }

    expect(() => new PlategaPaymentAdapter().parseWebhook(payload, 'bad-signature')).toThrow('signature is invalid')
  })
})
