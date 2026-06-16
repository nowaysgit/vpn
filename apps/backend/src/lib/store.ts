import type {
  AdminAuditLog,
  Device,
  DeviceCredential,
  EmailVerificationToken,
  Payment,
  PaymentEvent,
  Plan,
  Subscription,
  SupportTicket,
  TelegramAccount,
  TelegramLinkToken,
  User,
  VpnNode
} from './domain'
import { createId, createToken } from './id'
import { hashPassword } from './security'

export type AppStore = {
  users: User[]
  emailTokens: EmailVerificationToken[]
  sessions: Map<string, string>
  plans: Plan[]
  subscriptions: Subscription[]
  devices: Device[]
  credentials: DeviceCredential[]
  payments: Payment[]
  paymentEvents: PaymentEvent[]
  nodes: VpnNode[]
  auditLogs: AdminAuditLog[]
  supportTickets: SupportTicket[]
  telegramAccounts: TelegramAccount[]
  telegramLinkTokens: TelegramLinkToken[]
  readonly driver: 'memory' | 'postgres'
  persist?: () => Promise<void>
  close?: () => Promise<void>
}

export async function createSeededStore(): Promise<AppStore> {
  const ownerEmail = process.env.SEED_ADMIN_EMAIL ?? 'owner@vpn.local'
  const owner: User = {
    id: createId('usr'),
    email: ownerEmail,
    name: 'Owner',
    passwordHash: await hashPassword(process.env.SEED_ADMIN_PASSWORD ?? 'changeme'),
    emailVerified: true,
    role: 'owner',
    blocked: false,
    notes: null,
    subscriptionToken: createToken('subtok'),
    createdAt: new Date()
  }

  return {
    users: [owner],
    emailTokens: [],
    sessions: new Map(),
    plans: [
      {
        id: 'plan_starter',
        code: 'starter',
        title: 'Starter',
        priceRub: 299,
        durationDays: 30,
        trafficLimitGb: 200,
        deviceLimit: 4
      },
      {
        id: 'plan_plus',
        code: 'plus',
        title: 'Plus',
        priceRub: 499,
        durationDays: 30,
        trafficLimitGb: 500,
        deviceLimit: 4
      }
    ],
    subscriptions: [],
    devices: [],
    credentials: [],
    payments: [],
    paymentEvents: [],
    nodes: [
      {
        id: 'node_irkutsk_1',
        name: 'Irkutsk 1',
        locationCode: 'irk',
        provider: 'marzban',
        publicHost: 'irk-1.vpn.local',
        enabled: true
      },
      {
        id: 'node_external_fallback',
        name: 'External fallback',
        locationCode: 'fallback',
        provider: 'manual-external',
        publicHost: 'fallback.vpn.local',
        enabled: true
      }
    ],
    auditLogs: [],
    supportTickets: [],
    telegramAccounts: [],
    telegramLinkTokens: [],
    driver: 'memory'
  }
}

export async function createDefaultStore(): Promise<AppStore> {
  const configuredDriver = process.env.APP_STORE_DRIVER
  const driver = configuredDriver ?? (process.env.DATABASE_URL ? 'postgres' : 'memory')

  if (driver === 'postgres') {
    const { createPostgresStore } = await import('./postgres-store')
    return createPostgresStore()
  }

  if (driver !== 'memory') throw new Error(`Unsupported APP_STORE_DRIVER: ${driver}`)
  return createSeededStore()
}

export async function persistStore(store: AppStore): Promise<void> {
  if (store.persist) await store.persist()
}
