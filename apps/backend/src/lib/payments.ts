import { createHmac, timingSafeEqual } from 'node:crypto'
import type { PaymentInvoice, PaymentProvider, PaymentStatus } from '@vpn/api-contract'
import type { Payment } from './domain'
import { createId } from './id'

export type CreateInvoiceInput = {
  userId: string
  planId: string
  amountRub: number
  idempotencyKey: string
}

export type ParsedPaymentWebhook = {
  providerPaymentId: string
  providerEventId: string
  status: PaymentStatus
  rawPayload: unknown
}

type PaymentProviderConfig = {
  apiBaseUrl: string | undefined
  merchantId: string | undefined
  secret: string | undefined
}

export interface PaymentProviderAdapter {
  readonly id: PaymentProvider
  createInvoice(input: CreateInvoiceInput): Promise<PaymentInvoice>
  parseWebhook(payload: unknown, signature?: string): ParsedPaymentWebhook
}

export class PlategaPaymentAdapter implements PaymentProviderAdapter {
  readonly id = 'platega' as const

  async createInvoice(input: CreateInvoiceInput): Promise<PaymentInvoice> {
    const config = providerConfig('PLATEGA')
    if (config.apiBaseUrl) return createRemoteInvoice(this.id, config, input)
    assertSandboxAllowed(this.id)

    const id = createId('pay')

    return {
      id,
      provider: this.id,
      status: 'created',
      amountRub: input.amountRub,
      checkoutUrl: sandboxCheckoutUrl(this.id, id, input.idempotencyKey)
    }
  }

  parseWebhook(payload: unknown, signature?: string): ParsedPaymentWebhook {
    verifyWebhookSignature(payload, signature, providerConfig('PLATEGA').secret)
    const body = paymentPayload(payload)

    return {
      providerPaymentId: body.paymentId,
      providerEventId: body.eventId,
      status: body.status,
      rawPayload: payload
    }
  }
}

export class RollyPayPaymentAdapter implements PaymentProviderAdapter {
  readonly id = 'rollypay' as const

  async createInvoice(input: CreateInvoiceInput): Promise<PaymentInvoice> {
    const config = providerConfig('ROLLYPAY')
    if (config.apiBaseUrl) return createRemoteInvoice(this.id, config, input)
    assertSandboxAllowed(this.id)

    const id = createId('pay')

    return {
      id,
      provider: this.id,
      status: 'created',
      amountRub: input.amountRub,
      checkoutUrl: sandboxCheckoutUrl(this.id, id, input.idempotencyKey)
    }
  }

  parseWebhook(payload: unknown, signature?: string): ParsedPaymentWebhook {
    verifyWebhookSignature(payload, signature, providerConfig('ROLLYPAY').secret)
    const body = paymentPayload(payload)

    return {
      providerPaymentId: body.paymentId,
      providerEventId: body.eventId,
      status: body.status,
      rawPayload: payload
    }
  }
}

async function createRemoteInvoice(
  provider: Exclude<PaymentProvider, 'manual'>,
  config: PaymentProviderConfig,
  input: CreateInvoiceInput
): Promise<PaymentInvoice> {
  if (!config.apiBaseUrl) throw new Error(`${provider} API base URL is required`)
  if (!config.secret) throw new Error(`${provider} secret is required`)

  const payload = {
    merchantId: config.merchantId,
    orderId: input.idempotencyKey,
    userId: input.userId,
    planId: input.planId,
    amountRub: input.amountRub
  }
  const signature = createWebhookSignature(payload, config.secret)
  const response = await fetch(new URL('/invoices', normalizedBaseUrl(config.apiBaseUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-merchant-id': config.merchantId ?? '',
      'x-signature': signature
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) throw new Error(`${provider} invoice request failed with ${response.status}`)
  const body = (await response.json()) as Record<string, unknown>
  const invoiceId = stringField(body, 'id') ?? stringField(body, 'invoiceId') ?? stringField(body, 'paymentId')
  const checkoutUrl = stringField(body, 'checkoutUrl') ?? stringField(body, 'paymentUrl') ?? stringField(body, 'url')

  if (!invoiceId) throw new Error(`${provider} invoice response is missing id`)
  if (!checkoutUrl) throw new Error(`${provider} invoice response is missing checkout URL`)

  return {
    id: invoiceId,
    provider,
    status: 'created',
    amountRub: input.amountRub,
    checkoutUrl
  }
}

function providerConfig(prefix: 'PLATEGA' | 'ROLLYPAY'): PaymentProviderConfig {
  return {
    apiBaseUrl: process.env[`${prefix}_API_BASE_URL`],
    merchantId: process.env[`${prefix}_MERCHANT_ID`] ?? process.env[`${prefix}_SHOP_ID`],
    secret: process.env[`${prefix}_SECRET`]
  }
}

function normalizedBaseUrl(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function assertSandboxAllowed(provider: PaymentProvider): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${provider} API base URL is required in production`)
  }
}

function sandboxCheckoutUrl(provider: PaymentProvider, invoiceId: string, idempotencyKey: string): string {
  const publicUrl = process.env.API_PUBLIC_URL ?? 'http://localhost:3001'
  const url = new URL(`/payments/sandbox/${provider}/${invoiceId}`, publicUrl)
  url.searchParams.set('key', idempotencyKey)
  return url.toString()
}

function verifyWebhookSignature(payload: unknown, signature: string | undefined, secret: string | undefined): void {
  if (!secret || process.env.NODE_ENV === 'test') return
  if (!signature) throw new Error('Payment webhook signature is required')

  const expected = createWebhookSignature(payload, secret)
  const expectedBuffer = Buffer.from(expected)
  const signatureBuffer = Buffer.from(signature)

  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
    throw new Error('Payment webhook signature is invalid')
  }
}

export function createWebhookSignature(payload: unknown, secret: string): string {
  return createHmac('sha256', secret).update(stableJson(payload)).digest('hex')
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : null
}

export function paymentToInvoice(payment: Payment): PaymentInvoice {
  return {
    id: payment.id,
    provider: payment.provider,
    status: payment.status,
    amountRub: payment.amountRub,
    checkoutUrl: payment.checkoutUrl
  }
}

function paymentPayload(payload: unknown): {
  paymentId: string
  eventId: string
  status: PaymentStatus
} {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid payment webhook payload')

  const record = payload as Record<string, unknown>
  const paymentId = record.paymentId
  const eventId = record.eventId
  const status = record.status

  if (typeof paymentId !== 'string') throw new Error('paymentId is required')
  if (typeof eventId !== 'string') throw new Error('eventId is required')
  if (!isPaymentStatus(status)) throw new Error('Unsupported payment status')

  return { paymentId, eventId, status }
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return ['created', 'pending', 'paid', 'failed', 'cancelled', 'refunded'].includes(String(value))
}
