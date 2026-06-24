import { afterEach, describe, expect, test } from 'bun:test'
import { assertProductionConfig } from '../src/lib/config'

const originalEnv = { ...process.env }

describe('production config guard', () => {
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test('rejects production boot with missing database and default secrets', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.DATABASE_URL
    delete process.env.JWT_ACCESS_SECRET
    process.env.CREDENTIAL_ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

    expect(() => assertProductionConfig()).toThrow('Invalid production configuration')
  })

  test('accepts explicit postgres production configuration', () => {
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/vpn'
    process.env.JWT_ACCESS_SECRET = 'prod-secret-with-enough-entropy'
    process.env.CREDENTIAL_ENCRYPTION_KEY = '1111111111111111111111111111111111111111111111111111111111111111'
    process.env.APP_PUBLIC_URL = 'https://cabinet.example'
    process.env.API_PUBLIC_URL = 'https://api.example'
    process.env.TBANK_TERMINAL_KEY = 'tbank-terminal'
    process.env.TBANK_PASSWORD = 'tbank-password'
    process.env.TBANK_NOTIFICATION_URL = 'https://api.example/payments/webhooks/tbank'
    process.env.TBANK_SUCCESS_URL = 'https://cabinet.example'
    process.env.TBANK_FAIL_URL = 'https://cabinet.example'
    process.env.PLATEGA_API_BASE_URL = 'https://platega.local'
    process.env.PLATEGA_MERCHANT_ID = 'platega-merchant'
    process.env.PLATEGA_SECRET = 'platega-secret'
    process.env.EMAIL_PROVIDER = 'smtp'
    process.env.EMAIL_FROM = 'VPN Cabinet <robot@example.com>'
    process.env.EMAIL_SMTP_HOST = 'smtp.yandex.ru'
    process.env.EMAIL_SMTP_SECURE = 'true'
    process.env.EMAIL_SMTP_USER = 'robot@example.com'
    process.env.EMAIL_SMTP_PASSWORD = 'yandex-app-password'
    process.env.EMAIL_VERIFICATION_SECRET = 'prod-email-verification-secret'
    process.env.MARZBAN_BASE_URL = 'https://marzban.local'
    process.env.MARZBAN_USERNAME = 'marzban-api'
    process.env.MARZBAN_PASSWORD = 'marzban-secret'
    process.env.EXTERNAL_FALLBACK_URI_TEMPLATE = 'https://fallback.example/sub/{userId}/{deviceId}'
    process.env.TELEGRAM_BOT_SECRET = 'telegram-bot-secret'
    process.env.SEED_ADMIN_EMAIL = 'owner@example.com'
    process.env.SEED_ADMIN_PASSWORD = 'owner-password'

    expect(() => assertProductionConfig()).not.toThrow()
  })

  test('rejects T-Bank placeholders and local callback URLs in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/vpn'
    process.env.JWT_ACCESS_SECRET = 'prod-secret-with-enough-entropy'
    process.env.CREDENTIAL_ENCRYPTION_KEY = '1111111111111111111111111111111111111111111111111111111111111111'
    process.env.TBANK_TERMINAL_KEY = 'change-me'
    process.env.TBANK_PASSWORD = 'change-me'
    process.env.TBANK_NOTIFICATION_URL = 'http://localhost:3001/payments/webhooks/tbank'
    process.env.TBANK_SUCCESS_URL = 'http://localhost:3000'
    process.env.TBANK_FAIL_URL = 'http://localhost:3000'
    process.env.PLATEGA_API_BASE_URL = 'https://platega.example'
    process.env.PLATEGA_MERCHANT_ID = 'platega-merchant'
    process.env.PLATEGA_SECRET = 'platega-secret'
    process.env.EMAIL_PROVIDER = 'smtp'
    process.env.EMAIL_FROM = 'VPN Cabinet <robot@example.com>'
    process.env.EMAIL_SMTP_HOST = 'smtp.yandex.ru'
    process.env.EMAIL_SMTP_SECURE = 'true'
    process.env.EMAIL_SMTP_USER = 'robot@example.com'
    process.env.EMAIL_SMTP_PASSWORD = 'yandex-app-password'
    process.env.EMAIL_VERIFICATION_SECRET = 'prod-email-verification-secret'
    process.env.MARZBAN_BASE_URL = 'https://marzban.example'
    process.env.MARZBAN_USERNAME = 'marzban-api'
    process.env.MARZBAN_PASSWORD = 'marzban-secret'
    process.env.EXTERNAL_FALLBACK_URI_TEMPLATE = 'https://fallback.example/sub/{userId}/{deviceId}'
    process.env.TELEGRAM_BOT_SECRET = 'telegram-bot-secret'
    process.env.SEED_ADMIN_EMAIL = 'owner@example.com'
    process.env.SEED_ADMIN_PASSWORD = 'owner-password'

    expect(() => assertProductionConfig()).toThrow('TBANK_TERMINAL_KEY must be set')
  })

  test('rejects missing or local external fallback template in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/vpn'
    process.env.JWT_ACCESS_SECRET = 'prod-secret-with-enough-entropy'
    process.env.CREDENTIAL_ENCRYPTION_KEY = '1111111111111111111111111111111111111111111111111111111111111111'
    process.env.APP_PUBLIC_URL = 'https://cabinet.example'
    process.env.API_PUBLIC_URL = 'https://api.example'
    process.env.TBANK_TERMINAL_KEY = 'tbank-terminal'
    process.env.TBANK_PASSWORD = 'tbank-password'
    process.env.TBANK_NOTIFICATION_URL = 'https://api.example/payments/webhooks/tbank'
    process.env.TBANK_SUCCESS_URL = 'https://cabinet.example'
    process.env.TBANK_FAIL_URL = 'https://cabinet.example'
    process.env.PLATEGA_API_BASE_URL = 'https://platega.example'
    process.env.PLATEGA_MERCHANT_ID = 'platega-merchant'
    process.env.PLATEGA_SECRET = 'platega-secret'
    process.env.EMAIL_PROVIDER = 'smtp'
    process.env.EMAIL_FROM = 'VPN Cabinet <robot@example.com>'
    process.env.EMAIL_SMTP_HOST = 'smtp.yandex.ru'
    process.env.EMAIL_SMTP_SECURE = 'true'
    process.env.EMAIL_SMTP_USER = 'robot@example.com'
    process.env.EMAIL_SMTP_PASSWORD = 'yandex-app-password'
    process.env.EMAIL_VERIFICATION_SECRET = 'prod-email-verification-secret'
    process.env.MARZBAN_BASE_URL = 'https://marzban.example'
    process.env.MARZBAN_USERNAME = 'marzban-api'
    process.env.MARZBAN_PASSWORD = 'marzban-secret'
    process.env.TELEGRAM_BOT_SECRET = 'telegram-bot-secret'
    process.env.SEED_ADMIN_EMAIL = 'owner@example.com'
    process.env.SEED_ADMIN_PASSWORD = 'owner-password'
    process.env.EXTERNAL_FALLBACK_URI_TEMPLATE = 'http://fallback.localhost/sub/{userId}/{deviceId}'

    expect(() => assertProductionConfig()).toThrow('EXTERNAL_FALLBACK_URI_TEMPLATE must resolve to a public HTTPS URL')
  })
})
