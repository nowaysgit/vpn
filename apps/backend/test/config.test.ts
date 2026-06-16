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
    process.env.PLATEGA_API_BASE_URL = 'https://platega.local'
    process.env.PLATEGA_MERCHANT_ID = 'platega-merchant'
    process.env.PLATEGA_SECRET = 'platega-secret'
    process.env.ROLLYPAY_API_BASE_URL = 'https://rollypay.local'
    process.env.ROLLYPAY_MERCHANT_ID = 'rollypay-merchant'
    process.env.ROLLYPAY_SECRET = 'rollypay-secret'
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
