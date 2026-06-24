import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  index,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core'

export const userRole = pgEnum('user_role', ['owner', 'admin', 'support', 'customer'])
export const subscriptionStatus = pgEnum('subscription_status', [
  'trialing',
  'active',
  'traffic_over_limit',
  'grace',
  'expired',
  'blocked'
])
export const deviceStatus = pgEnum('device_status', ['active', 'revoked', 'pending_replacement'])
export const paymentProvider = pgEnum('payment_provider', ['tbank', 'platega', 'manual'])
export const paymentStatus = pgEnum('payment_status', [
  'created',
  'pending',
  'paid',
  'failed',
  'cancelled',
  'refunded'
])
export const vpnProtocol = pgEnum('vpn_protocol', ['vless-reality', 'trojan-tls', 'shadowsocks', 'external-manual'])

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    role: userRole('role').notNull().default('customer'),
    blocked: boolean('blocked').notNull().default(false),
    notes: text('notes'),
    subscriptionToken: text('subscription_token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
    subscriptionTokenIdx: uniqueIndex('users_subscription_token_idx').on(table.subscriptionToken)
  })
)

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    tokenHashIdx: uniqueIndex('sessions_token_hash_idx').on(table.tokenHash),
    userExpiresAtIdx: index('sessions_user_expires_at_idx').on(table.userId, table.expiresAt)
  })
)

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  resendAvailableAt: timestamp('resend_available_at', { withTimezone: true }).notNull().defaultNow(),
  usedAt: timestamp('used_at', { withTimezone: true })
})

export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  priceRub: integer('price_rub').notNull(),
  durationDays: integer('duration_days').notNull(),
  trafficLimitGb: integer('traffic_limit_gb').notNull(),
  deviceLimit: integer('device_limit').notNull().default(4)
})

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  planId: text('plan_id').notNull().references(() => plans.id),
  status: subscriptionStatus('status').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  graceEndsAt: timestamp('grace_ends_at', { withTimezone: true }).notNull(),
  trafficUsedBytes: bigint('traffic_used_bytes', { mode: 'bigint' }).notNull().default(0n),
  trafficLimitBytes: bigint('traffic_limit_bytes', { mode: 'bigint' }).notNull(),
  grantedByAdminId: text('granted_by_admin_id').references(() => users.id)
})

export const devices = pgTable('devices', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  label: text('label').notNull(),
  status: deviceStatus('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
})

export const deviceCredentials = pgTable('device_credentials', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  deviceId: text('device_id').notNull().references(() => devices.id),
  encryptedPayload: text('encrypted_payload').notNull(),
  serverId: text('server_id').notNull(),
  protocols: vpnProtocol('protocols').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true })
})

export const credentialServerHistory = pgTable('credential_server_history', {
  id: text('id').primaryKey(),
  credentialId: text('credential_id').notNull().references(() => deviceCredentials.id),
  serverId: text('server_id').notNull(),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow()
})

export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    planId: text('plan_id').notNull().references(() => plans.id),
    provider: paymentProvider('provider').notNull(),
    providerPaymentId: text('provider_payment_id').notNull(),
    status: paymentStatus('status').notNull(),
    amountRub: integer('amount_rub').notNull(),
    checkoutUrl: text('checkout_url').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true })
  },
  (table) => ({
    providerPaymentIdx: uniqueIndex('payments_provider_payment_idx').on(table.provider, table.providerPaymentId),
    idempotencyIdx: uniqueIndex('payments_idempotency_idx').on(table.userId, table.idempotencyKey)
  })
)

export const paymentEvents = pgTable(
  'payment_events',
  {
    id: text('id').primaryKey(),
    paymentId: text('payment_id').notNull().references(() => payments.id),
    provider: paymentProvider('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    status: paymentStatus('status').notNull(),
    rawPayload: jsonb('raw_payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    providerEventIdx: uniqueIndex('payment_events_provider_event_idx').on(table.provider, table.providerEventId)
  })
)

export const vpnNodes = pgTable('vpn_nodes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  locationCode: text('location_code').notNull(),
  provider: text('provider').notNull(),
  publicHost: text('public_host').notNull(),
  enabled: boolean('enabled').notNull().default(true)
})

export const usageSnapshots = pgTable('usage_snapshots', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  deviceId: text('device_id').notNull().references(() => devices.id),
  trafficUsedBytes: bigint('traffic_used_bytes', { mode: 'bigint' }).notNull(),
  activeConnections: integer('active_connections').notNull(),
  sampledAt: timestamp('sampled_at', { withTimezone: true }).notNull()
})

export const adminActionLogs = pgTable('admin_action_logs', {
  id: text('id').primaryKey(),
  actorUserId: text('actor_user_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const telegramAccounts = pgTable('telegram_accounts', {
  telegramUserId: text('telegram_user_id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  username: text('username'),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow()
})

export const telegramLinkTokens = pgTable('telegram_link_tokens', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true })
})

export const supportTickets = pgTable('support_tickets', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})
