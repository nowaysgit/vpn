import type { AppStore } from './store'

const ZERO_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

export function assertProductionConfig(store: AppStore): void {
  if (process.env.NODE_ENV !== 'production') return

  const errors: string[] = []

  if (store.driver !== 'postgres') errors.push('APP_STORE_DRIVER=postgres and DATABASE_URL are required')
  if (!process.env.DATABASE_URL) errors.push('DATABASE_URL is required')
  if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET === 'dev-secret-change-me') {
    errors.push('JWT_ACCESS_SECRET must be set to a production secret')
  }
  if (!isStrongCredentialKey(process.env.CREDENTIAL_ENCRYPTION_KEY)) {
    errors.push('CREDENTIAL_ENCRYPTION_KEY must be a non-default 64-character hex key')
  }
  assertTBankConfig(errors)
  assertPaymentProviderConfig('PLATEGA', errors)
  assertEmailConfig(errors)
  assertMarzbanConfig(errors)
  if (!process.env.TELEGRAM_BOT_SECRET) errors.push('TELEGRAM_BOT_SECRET is required')

  if (errors.length > 0) throw new Error(`Invalid production configuration: ${errors.join('; ')}`)
}

function isStrongCredentialKey(value: string | undefined): boolean {
  if (!value) return false
  if (value === ZERO_KEY) return false
  return /^[0-9a-fA-F]{64}$/.test(value)
}

function assertTBankConfig(errors: string[]): void {
  if (!process.env.TBANK_TERMINAL_KEY || process.env.TBANK_TERMINAL_KEY === 'demo') {
    errors.push('TBANK_TERMINAL_KEY must be set')
  }
  if (!process.env.TBANK_PASSWORD || process.env.TBANK_PASSWORD === 'demo-secret') {
    errors.push('TBANK_PASSWORD must be set to a production secret')
  }
  if (!process.env.TBANK_NOTIFICATION_URL && !process.env.API_PUBLIC_URL) {
    errors.push('TBANK_NOTIFICATION_URL or API_PUBLIC_URL is required')
  }
}

function assertPaymentProviderConfig(prefix: 'PLATEGA', errors: string[]): void {
  const baseUrl = process.env[`${prefix}_API_BASE_URL`]
  const merchantId = process.env[`${prefix}_MERCHANT_ID`] ?? process.env[`${prefix}_SHOP_ID`]
  const secret = process.env[`${prefix}_SECRET`]

  if (!baseUrl) errors.push(`${prefix}_API_BASE_URL is required`)
  if (!merchantId || merchantId === 'demo') errors.push(`${prefix}_MERCHANT_ID or ${prefix}_SHOP_ID must be set`)
  if (!secret || secret === 'demo-secret') errors.push(`${prefix}_SECRET must be set to a production secret`)
}

function assertEmailConfig(errors: string[]): void {
  if ((process.env.EMAIL_PROVIDER ?? 'smtp') !== 'smtp') errors.push('EMAIL_PROVIDER=smtp is required in production')
  if (!process.env.EMAIL_VERIFICATION_BASE_URL && !process.env.APP_PUBLIC_URL) {
    errors.push('EMAIL_VERIFICATION_BASE_URL or APP_PUBLIC_URL is required')
  }
  if (!process.env.EMAIL_SMTP_HOST) errors.push('EMAIL_SMTP_HOST is required')
  if (!process.env.EMAIL_SMTP_USER) errors.push('EMAIL_SMTP_USER is required')
  if (!process.env.EMAIL_SMTP_PASSWORD || process.env.EMAIL_SMTP_PASSWORD === 'change-me') {
    errors.push('EMAIL_SMTP_PASSWORD must be set to an app password')
  }
  if (!process.env.EMAIL_FROM) errors.push('EMAIL_FROM is required')
  if ((process.env.EMAIL_SMTP_SECURE ?? 'true') !== 'true') errors.push('EMAIL_SMTP_SECURE=true is required')
}

function assertMarzbanConfig(errors: string[]): void {
  if (!process.env.MARZBAN_BASE_URL) errors.push('MARZBAN_BASE_URL is required')
  if (!process.env.MARZBAN_USERNAME || process.env.MARZBAN_USERNAME === 'admin') {
    errors.push('MARZBAN_USERNAME must be set to the production API user')
  }
  if (!process.env.MARZBAN_PASSWORD || process.env.MARZBAN_PASSWORD === 'admin') {
    errors.push('MARZBAN_PASSWORD must be set to a production secret')
  }
}
