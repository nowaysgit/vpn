import { afterEach, describe, expect, test } from 'bun:test'
import { assertProductionConfig } from '../src/lib/config'
import { createSeededStore } from '../src/lib/store'

const originalEnv = { ...process.env }

describe('production config guard', () => {
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test('rejects production boot with memory store and default secrets', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.DATABASE_URL
    delete process.env.JWT_ACCESS_SECRET
    process.env.CREDENTIAL_ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

    const store = await createSeededStore()

    expect(() => assertProductionConfig(store)).toThrow('Invalid production configuration')
  })

  test('accepts explicit postgres production configuration', async () => {
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/vpn'
    process.env.JWT_ACCESS_SECRET = 'prod-secret-with-enough-entropy'
    process.env.CREDENTIAL_ENCRYPTION_KEY = '1111111111111111111111111111111111111111111111111111111111111111'
    process.env.APP_PUBLIC_URL = 'https://cabinet.example'
    process.env.API_PUBLIC_URL = 'https://api.example'
    process.env.TBANK_TERMINAL_KEY = 'tbank-terminal'
    process.env.TBANK_PASSWORD = 'tbank-password'
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
    process.env.TELEGRAM_BOT_SECRET = 'telegram-bot-secret'

    const store = await createSeededStore()
    const postgresStore = {
      ...store,
      driver: 'postgres' as const
    }

    expect(() => assertProductionConfig(postgresStore)).not.toThrow()
  })
})
