import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { PaymentInvoice, PaymentProvider, PaymentStatus } from '@vpn/api-contract'
import type { Payment } from './domain'
import { createId } from './id'

export type CreateInvoiceInput = {
  userId: string
  planId: string
  amountRub: number
  idempotencyKey: string
  email?: string
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

export class TBankPaymentAdapter implements PaymentProviderAdapter {
  readonly id = 'tbank' as const

  async createInvoice(input: CreateInvoiceInput): Promise<PaymentInvoice> {
    const config = tBankConfig()
    if (process.env.NODE_ENV !== 'test' && config.terminalKey && config.password) return createTBankInvoice(config, input)
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

  parseWebhook(payload: unknown): ParsedPaymentWebhook {
    verifyTBankNotificationToken(payload, tBankConfig().password)
    const record = recordPayload(payload)
    const paymentId = stringLikeField(record, 'PaymentId')
    const status = tBankStatus(record.Status)

    if (!paymentId) throw new Error('PaymentId is required')

    return {
      providerPaymentId: paymentId,
      providerEventId: [paymentId, String(record.Status ?? ''), String(record.Amount ?? ''), String(record.Success ?? '')].join(':'),
      status,
      rawPayload: payload
    }
  }
}

export class PlategaPaymentAdapter implements PaymentProviderAdapter {
  readonly id = 'platega' as const

  async createInvoice(input: CreateInvoiceInput): Promise<PaymentInvoice> {
    const config = providerConfig('PLATEGA')
    if (process.env.NODE_ENV !== 'test' && config.apiBaseUrl) return createRemoteInvoice(this.id, config, input)
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

function providerConfig(prefix: 'PLATEGA'): PaymentProviderConfig {
  return {
    apiBaseUrl: process.env[`${prefix}_API_BASE_URL`],
    merchantId: process.env[`${prefix}_MERCHANT_ID`] ?? process.env[`${prefix}_SHOP_ID`],
    secret: process.env[`${prefix}_SECRET`]
  }
}

type TBankConfig = {
  apiBaseUrl: string
  terminalKey: string | undefined
  password: string | undefined
  notificationUrl: string | undefined
  successUrl: string | undefined
  failUrl: string | undefined
  description: string
  receiptTaxation: string | undefined
  receiptTax: string
  receiptPaymentMethod: string
  receiptPaymentObject: string
}

function tBankConfig(): TBankConfig {
  return {
    apiBaseUrl: process.env.TBANK_API_BASE_URL ?? 'https://securepay.tinkoff.ru',
    terminalKey: process.env.TBANK_TERMINAL_KEY,
    password: process.env.TBANK_PASSWORD,
    notificationUrl: process.env.TBANK_NOTIFICATION_URL ?? publicApiUrl('/payments/webhooks/tbank'),
    successUrl: process.env.TBANK_SUCCESS_URL ?? publicAppUrl('/'),
    failUrl: process.env.TBANK_FAIL_URL ?? publicAppUrl('/'),
    description: process.env.TBANK_DESCRIPTION ?? 'VPN subscription',
    receiptTaxation: process.env.TBANK_RECEIPT_TAXATION,
    receiptTax: process.env.TBANK_RECEIPT_TAX ?? 'none',
    receiptPaymentMethod: process.env.TBANK_RECEIPT_PAYMENT_METHOD ?? 'full_payment',
    receiptPaymentObject: process.env.TBANK_RECEIPT_PAYMENT_OBJECT ?? 'service'
  }
}

async function createTBankInvoice(config: TBankConfig, input: CreateInvoiceInput): Promise<PaymentInvoice> {
  if (!config.terminalKey) throw new Error('TBank terminal key is required')
  if (!config.password) throw new Error('TBank password is required')

  const amountKopeks = Math.round(input.amountRub * 100)
  const payload: Record<string, unknown> = {
    TerminalKey: config.terminalKey,
    Amount: amountKopeks,
    OrderId: tBankOrderId(input.idempotencyKey),
    Description: config.description,
    NotificationURL: config.notificationUrl,
    SuccessURL: config.successUrl,
    FailURL: config.failUrl,
    PayType: 'O',
    DATA: {
      userId: input.userId,
      planId: input.planId,
      email: input.email
    }
  }
  const receipt = tBankReceipt(config, input.email, amountKopeks)
  if (receipt) payload.Receipt = receipt
  payload.Token = createTBankToken(payload, config.password)

  const response = await fetch(new URL('/v2/Init', normalizedBaseUrl(config.apiBaseUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) throw new Error(`tbank invoice request failed with ${response.status}`)

  const body = (await response.json()) as Record<string, unknown>
  if (body.Success === false) {
    const message = stringField(body, 'Message') ?? stringField(body, 'Details') ?? 'TBank invoice request failed'
    throw new Error(message)
  }

  const invoiceId = stringLikeField(body, 'PaymentId')
  const checkoutUrl = stringField(body, 'PaymentURL') ?? stringField(body, 'PaymentUrl')

  if (!invoiceId) throw new Error('tbank invoice response is missing PaymentId')
  if (!checkoutUrl) throw new Error('tbank invoice response is missing PaymentURL')

  return {
    id: invoiceId,
    provider: 'tbank',
    status: 'created',
    amountRub: input.amountRub,
    checkoutUrl
  }
}

function tBankReceipt(config: TBankConfig, email: string | undefined, amountKopeks: number): Record<string, unknown> | null {
  if (!config.receiptTaxation) return null

  return {
    Email: email,
    Taxation: config.receiptTaxation,
    Items: [
      {
        Name: config.description,
        Price: amountKopeks,
        Quantity: 1,
        Amount: amountKopeks,
        PaymentMethod: config.receiptPaymentMethod,
        PaymentObject: config.receiptPaymentObject,
        Tax: config.receiptTax
      }
    ]
  }
}

export function createTBankToken(payload: Record<string, unknown>, password: string): string {
  const tokenPayload: Record<string, string> = {}

  for (const [key, value] of Object.entries(payload)) {
    if (key === 'Token' || value === undefined || value === null) continue
    if (typeof value === 'object') continue
    tokenPayload[key] = String(value)
  }

  tokenPayload.Password = password

  const source = Object.keys(tokenPayload)
    .sort()
    .map((key) => tokenPayload[key])
    .join('')

  return createHash('sha256').update(source, 'utf8').digest('hex')
}

function verifyTBankNotificationToken(payload: unknown, password: string | undefined): void {
  if (!password || process.env.NODE_ENV === 'test') return
  const record = recordPayload(payload)
  const token = stringField(record, 'Token')
  if (!token) throw new Error('Payment webhook Token is required')

  const expected = createTBankToken(record, password)
  const expectedBuffer = Buffer.from(expected.toLowerCase())
  const tokenBuffer = Buffer.from(token.toLowerCase())

  if (expectedBuffer.length !== tokenBuffer.length || !timingSafeEqual(expectedBuffer, tokenBuffer)) {
    throw new Error('Payment webhook Token is invalid')
  }
}

function tBankStatus(value: unknown): PaymentStatus {
  const status = String(value ?? '').toUpperCase()
  if (status === 'CONFIRMED') return 'paid'
  if (['AUTH_FAIL', 'REJECTED'].includes(status)) return 'failed'
  if (['CANCELED', 'DEADLINE_EXPIRED', 'REVERSED', 'PARTIAL_REVERSED'].includes(status)) return 'cancelled'
  if (['REFUNDED', 'PARTIAL_REFUNDED'].includes(status)) return 'refunded'
  if (
    [
      'NEW',
      'FORM_SHOWED',
      'PREAUTHORIZING',
      'AUTHORIZING',
      'AUTHORIZED',
      '3DS_CHECKING',
      '3DS_CHECKED',
      'CONFIRMING',
      'REFUNDING',
      'REVERSING'
    ].includes(status)
  ) {
    return 'pending'
  }

  throw new Error(`Unsupported TBank payment status: ${String(value)}`)
}

function tBankOrderId(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (normalized.length <= 36) return normalized

  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 8)
  return `${normalized.slice(0, 27)}_${digest}`
}

function publicApiUrl(path: string): string {
  const base = process.env.API_PUBLIC_URL ?? 'http://localhost:3001'
  return new URL(path, normalizedBaseUrl(base)).toString()
}

function publicAppUrl(path: string): string {
  const base = process.env.APP_PUBLIC_URL ?? 'http://localhost:3000'
  return new URL(path, normalizedBaseUrl(base)).toString()
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

function stringLikeField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
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
  const record = recordPayload(payload)
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

function recordPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid payment webhook payload')
  return payload as Record<string, unknown>
}
