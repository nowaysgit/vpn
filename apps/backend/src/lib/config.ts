const ZERO_KEY = '0000000000000000000000000000000000000000000000000000000000000000'
const PLACEHOLDERS = new Set(['change-me', 'changeme', 'demo', 'demo-secret', 'dev-secret-change-me'])

export function assertProductionConfig(): void {
  if (process.env.NODE_ENV !== 'production') return

  const errors: string[] = []

  if (!process.env.DATABASE_URL) errors.push('DATABASE_URL is required')
  if (isPlaceholder(process.env.JWT_ACCESS_SECRET)) {
    errors.push('JWT_ACCESS_SECRET must be set to a production secret')
  }
  if (!isStrongCredentialKey(process.env.CREDENTIAL_ENCRYPTION_KEY)) {
    errors.push('CREDENTIAL_ENCRYPTION_KEY must be a non-default 64-character hex key')
  }
  assertTBankConfig(errors)
  assertPaymentProviderConfig('PLATEGA', errors)
  assertEmailConfig(errors)
  assertMarzbanConfig(errors)
  assertExternalFallbackConfig(errors)
  if (!process.env.TELEGRAM_BOT_SECRET) errors.push('TELEGRAM_BOT_SECRET is required')
  if (!process.env.SEED_ADMIN_EMAIL) errors.push('SEED_ADMIN_EMAIL is required')
  if (isPlaceholder(process.env.SEED_ADMIN_PASSWORD)) {
    errors.push('SEED_ADMIN_PASSWORD must be set to a production secret')
  }

  if (errors.length > 0) throw new Error(`Invalid production configuration: ${errors.join('; ')}`)
}

function isStrongCredentialKey(value: string | undefined): boolean {
  if (!value) return false
  if (value === ZERO_KEY) return false
  return /^[0-9a-fA-F]{64}$/.test(value)
}

function assertTBankConfig(errors: string[]): void {
  if (isPlaceholder(process.env.TBANK_TERMINAL_KEY)) {
    errors.push('TBANK_TERMINAL_KEY must be set')
  }
  if (isPlaceholder(process.env.TBANK_PASSWORD)) {
    errors.push('TBANK_PASSWORD must be set to a production secret')
  }

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
}

function assertPaymentProviderConfig(prefix: 'PLATEGA', errors: string[]): void {
  const baseUrl = process.env[`${prefix}_API_BASE_URL`]
  const merchantId = process.env[`${prefix}_MERCHANT_ID`] ?? process.env[`${prefix}_SHOP_ID`]
  const secret = process.env[`${prefix}_SECRET`]

  if (!baseUrl) errors.push(`${prefix}_API_BASE_URL is required`)
  if (isPlaceholder(merchantId)) errors.push(`${prefix}_MERCHANT_ID or ${prefix}_SHOP_ID must be set`)
  if (isPlaceholder(secret)) errors.push(`${prefix}_SECRET must be set to a production secret`)
}

function assertEmailConfig(errors: string[]): void {
  if ((process.env.EMAIL_PROVIDER ?? 'smtp') !== 'smtp') errors.push('EMAIL_PROVIDER=smtp is required in production')
  if (!process.env.EMAIL_VERIFICATION_SECRET || process.env.EMAIL_VERIFICATION_SECRET === 'dev-email-verification-secret') {
    errors.push('EMAIL_VERIFICATION_SECRET must be set to a production secret')
  }
  if (!process.env.EMAIL_SMTP_HOST) errors.push('EMAIL_SMTP_HOST is required')
  if (!process.env.EMAIL_SMTP_USER) errors.push('EMAIL_SMTP_USER is required')
  if (isPlaceholder(process.env.EMAIL_SMTP_PASSWORD)) {
    errors.push('EMAIL_SMTP_PASSWORD must be set to an app password')
  }
  if (!process.env.EMAIL_FROM) errors.push('EMAIL_FROM is required')
  if ((process.env.EMAIL_SMTP_SECURE ?? 'true') !== 'true') errors.push('EMAIL_SMTP_SECURE=true is required')
}

function assertMarzbanConfig(errors: string[]): void {
  if (!process.env.MARZBAN_BASE_URL) errors.push('MARZBAN_BASE_URL is required')
  if (isPlaceholder(process.env.MARZBAN_USERNAME) || process.env.MARZBAN_USERNAME === 'admin') {
    errors.push('MARZBAN_USERNAME must be set to the production API user')
  }
  if (isPlaceholder(process.env.MARZBAN_PASSWORD) || process.env.MARZBAN_PASSWORD === 'admin') {
    errors.push('MARZBAN_PASSWORD must be set to a production secret')
  }
}

function assertExternalFallbackConfig(errors: string[]): void {
  const template = process.env.EXTERNAL_FALLBACK_URI_TEMPLATE
  if (!template) {
    errors.push('EXTERNAL_FALLBACK_URI_TEMPLATE is required')
    return
  }
  if (!template.includes('{userId}') || !template.includes('{deviceId}')) {
    errors.push('EXTERNAL_FALLBACK_URI_TEMPLATE must include {userId} and {deviceId}')
  }

  const preview = template
    .replaceAll('{userId}', 'usr_preview')
    .replaceAll('{deviceId}', 'dev_preview')
    .replaceAll('{label}', 'Preview')
  if (!isPublicHttpsUrl(preview)) errors.push('EXTERNAL_FALLBACK_URI_TEMPLATE must resolve to a public HTTPS URL')
}

function isPlaceholder(value: string | undefined): boolean {
  return !value || PLACEHOLDERS.has(value.trim().toLowerCase())
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
