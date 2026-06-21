import { afterEach, describe, expect, test } from 'bun:test'
import { createTBankToken, createWebhookSignature, PlategaPaymentAdapter, TBankPaymentAdapter } from '../src/lib/payments'

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

  test('creates T-Bank tokens from root scalar fields only', () => {
    const token = createTBankToken(
      {
        TerminalKey: 'T',
        Amount: 100,
        OrderId: 'O',
        DATA: { ignored: true }
      },
      'secret'
    )

    expect(token).toBe('6c5788ab9cb2787ff5deb331cdcf0ddd9c6a607ad14cc08c071c0866aa64c055')
  })

  test('maps T-Bank confirmed notifications to paid payments', () => {
    process.env.NODE_ENV = 'test'
    const parsed = new TBankPaymentAdapter().parseWebhook({
      PaymentId: 'pay_1',
      Status: 'CONFIRMED',
      Success: true,
      Amount: 29900
    })

    expect(parsed.providerPaymentId).toBe('pay_1')
    expect(parsed.status).toBe('paid')
  })
})
