#!/usr/bin/env bun
import { TBankPaymentAdapter } from '../../apps/backend/src/lib/payments'

const terminalKey = process.env.TBANK_TERMINAL_KEY
const password = process.env.TBANK_PASSWORD
const strict = process.env.EXTERNAL_SMOKE_STRICT === 'true'

const configErrors = tBankSmokeConfigErrors()
if (configErrors.length > 0) {
  const message = `T-Bank smoke skipped: ${configErrors.join('; ')}.`
  if (strict) {
    console.error(message)
    process.exit(1)
  }

  console.log(message)
  process.exit(0)
}

const amountRub = Number(process.env.TBANK_SMOKE_AMOUNT_RUB ?? 10)
const email = process.env.TBANK_SMOKE_EMAIL ?? 'smoke@example.com'
const adapter = new TBankPaymentAdapter()
const invoice = await adapter.createInvoice({
  userId: 'smoke-user',
  planId: 'smoke-plan',
  amountRub,
  idempotencyKey: `smoke-${Date.now()}`,
  email
})

console.log(JSON.stringify(invoice, null, 2))

function tBankSmokeConfigErrors(): string[] {
  const errors: string[] = []
  if (isPlaceholder(terminalKey)) errors.push('TBANK_TERMINAL_KEY must be a real terminal key')
  if (isPlaceholder(password)) errors.push('TBANK_PASSWORD must be a real terminal password')

  const notificationUrl = process.env.TBANK_NOTIFICATION_URL ?? publicUrl('/payments/webhooks/tbank')
  if (!notificationUrl) {
    errors.push('TBANK_NOTIFICATION_URL or API_PUBLIC_URL is required')
  } else if (!isPublicHttpsUrl(notificationUrl)) {
    errors.push('TBANK_NOTIFICATION_URL or API_PUBLIC_URL must resolve to a public HTTPS URL')
  }

  for (const key of ['TBANK_SUCCESS_URL', 'TBANK_FAIL_URL'] as const) {
    const value = process.env[key]
    if (value && !isPublicHttpsUrl(value)) errors.push(`${key} must be a public HTTPS URL`)
  }

  return errors
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true
  return ['change-me', 'changeme', 'demo', 'demo-secret'].includes(value.trim().toLowerCase())
}

function publicUrl(path: string): string | undefined {
  if (!process.env.API_PUBLIC_URL) return undefined
  return new URL(path, normalizedBaseUrl(process.env.API_PUBLIC_URL)).toString()
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !isLocalHostname(url.hostname)
  } catch {
    return false
  }
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local')
  )
}

function normalizedBaseUrl(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}
