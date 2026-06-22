import { Pool, type QueryResultRow } from 'pg'
import type {
  Device,
  DeviceCredential,
  Payment,
  PaymentEvent,
  Subscription,
  SupportTicket,
  TelegramAccount,
  TelegramLinkToken,
  User,
  VpnNode
} from './domain'
import { createSeededStore, type AppStore } from './store'

type CreatePostgresStoreOptions = {
  connectionString?: string
  pool?: Pool
}

type UserRow = QueryResultRow & {
  id: string
  email: string
  name: string
  password_hash: string
  email_verified: boolean
  role: User['role']
  blocked: boolean
  notes: string | null
  subscription_token: string
  created_at: Date
}

type EmailTokenRow = QueryResultRow & {
  token: string
  user_id: string
  expires_at: Date
  resend_available_at: Date
  used_at: Date | null
}

type PlanRow = QueryResultRow & {
  id: string
  code: string
  title: string
  price_rub: number
  duration_days: number
  traffic_limit_gb: number
  device_limit: number
}

type SubscriptionRow = QueryResultRow & {
  id: string
  user_id: string
  plan_id: string
  status: Subscription['status']
  starts_at: Date
  ends_at: Date
  grace_ends_at: Date
  traffic_used_bytes: string
  traffic_limit_bytes: string
  granted_by_admin_id: string | null
}

type DeviceRow = QueryResultRow & {
  id: string
  user_id: string
  label: string
  status: Device['status']
  created_at: Date
  last_seen_at: Date | null
}

type CredentialRow = QueryResultRow & {
  id: string
  user_id: string
  device_id: string
  encrypted_payload: string
  server_id: string
  protocols: DeviceCredential['protocols']
  created_at: Date
  revoked_at: Date | null
}

type PaymentRow = QueryResultRow & {
  id: string
  user_id: string
  plan_id: string
  provider: Payment['provider']
  provider_payment_id: string
  status: Payment['status']
  amount_rub: number
  checkout_url: string
  idempotency_key: string
  created_at: Date
  paid_at: Date | null
}

type PaymentEventRow = QueryResultRow & {
  id: string
  payment_id: string
  provider: PaymentEvent['provider']
  provider_event_id: string
  status: PaymentEvent['status']
  raw_payload: unknown
  created_at: Date
}

type NodeRow = QueryResultRow & {
  id: string
  name: string
  location_code: string
  provider: VpnNode['provider']
  public_host: string
  enabled: boolean
}

type AuditRow = QueryResultRow & {
  id: string
  actor_user_id: string
  action: string
  target_type: string
  target_id: string
  created_at: Date
}

type SupportTicketRow = QueryResultRow & {
  id: string
  user_id: string
  subject: string
  message: string
  status: SupportTicket['status']
  created_at: Date
}

type TelegramAccountRow = QueryResultRow & {
  telegram_user_id: string
  user_id: string
  username: string | null
  linked_at: Date
}

type TelegramLinkTokenRow = QueryResultRow & {
  token: string
  user_id: string
  expires_at: Date
  used_at: Date | null
}

export async function createPostgresStore(options: CreatePostgresStoreOptions = {}): Promise<AppStore> {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL
  if (!options.pool && !connectionString) throw new Error('DATABASE_URL is required for postgres store')

  const pool = options.pool ?? new Pool({ connectionString })
  const store = await loadStore(pool)
  await seedRequiredRows(pool, store)
  const seededStore = await loadStore(pool)

  seededStore.persist = () => saveStore(pool, seededStore)
  seededStore.close = () => pool.end()

  return seededStore
}

async function seedRequiredRows(pool: Pool, store: AppStore): Promise<void> {
  const seed = await createSeededStore()
  const owner = seed.users[0]
  if (!owner) throw new Error('Seed owner is missing')

  let changed = false

  for (const plan of seed.plans) {
    if (!store.plans.some((item) => item.id === plan.id)) {
      store.plans.push(plan)
      changed = true
    }
  }

  for (const node of seed.nodes) {
    if (!store.nodes.some((item) => item.id === node.id)) {
      store.nodes.push(node)
      changed = true
    }
  }

  if (!store.users.some((user) => user.role === 'owner')) {
    store.users.push(owner)
    changed = true
  }

  if (changed) await saveStore(pool, store)
}

async function loadStore(pool: Pool): Promise<AppStore> {
  const [
    users,
    emailTokens,
    plans,
    subscriptions,
    devices,
    credentials,
    payments,
    paymentEvents,
    nodes,
    auditLogs,
    supportTickets,
    telegramAccounts,
    telegramLinkTokens
  ] = await Promise.all([
    rows<UserRow>(pool, 'select * from users order by created_at asc'),
    rows<EmailTokenRow>(pool, 'select * from email_verification_tokens order by expires_at asc'),
    rows<PlanRow>(pool, 'select * from plans order by price_rub asc'),
    rows<SubscriptionRow>(pool, 'select * from subscriptions order by starts_at asc'),
    rows<DeviceRow>(pool, 'select * from devices order by created_at asc'),
    rows<CredentialRow>(pool, 'select * from device_credentials order by created_at asc'),
    rows<PaymentRow>(pool, 'select * from payments order by created_at asc'),
    rows<PaymentEventRow>(pool, 'select * from payment_events order by created_at asc'),
    rows<NodeRow>(pool, 'select * from vpn_nodes order by name asc'),
    rows<AuditRow>(pool, 'select * from admin_action_logs order by created_at asc'),
    rows<SupportTicketRow>(pool, 'select * from support_tickets order by created_at asc'),
    rows<TelegramAccountRow>(pool, 'select * from telegram_accounts order by linked_at asc'),
    rows<TelegramLinkTokenRow>(pool, 'select * from telegram_link_tokens order by expires_at asc')
  ])

  return {
    users: users.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      emailVerified: row.email_verified,
      role: row.role,
      blocked: row.blocked,
      notes: row.notes,
      subscriptionToken: row.subscription_token,
      createdAt: row.created_at
    })),
    emailTokens: emailTokens.map((row) => ({
      token: row.token,
      userId: row.user_id,
      expiresAt: row.expires_at,
      resendAvailableAt: row.resend_available_at,
      usedAt: row.used_at
    })),
    sessions: new Map(),
    plans: plans.map((row) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      priceRub: row.price_rub,
      durationDays: row.duration_days,
      trafficLimitGb: row.traffic_limit_gb,
      deviceLimit: row.device_limit
    })),
    subscriptions: subscriptions.map((row) => ({
      id: row.id,
      userId: row.user_id,
      planId: row.plan_id,
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      graceEndsAt: row.grace_ends_at,
      trafficUsedBytes: BigInt(row.traffic_used_bytes),
      trafficLimitBytes: BigInt(row.traffic_limit_bytes),
      grantedByAdminId: row.granted_by_admin_id
    })),
    devices: devices.map((row) => ({
      id: row.id,
      userId: row.user_id,
      label: row.label,
      status: row.status,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at
    })),
    credentials: credentials.map((row) => ({
      id: row.id,
      userId: row.user_id,
      deviceId: row.device_id,
      encryptedPayload: row.encrypted_payload,
      serverId: row.server_id,
      protocols: row.protocols,
      createdAt: row.created_at,
      revokedAt: row.revoked_at
    })),
    payments: payments.map((row) => ({
      id: row.id,
      userId: row.user_id,
      planId: row.plan_id,
      provider: row.provider,
      providerPaymentId: row.provider_payment_id,
      status: row.status,
      amountRub: row.amount_rub,
      checkoutUrl: row.checkout_url,
      idempotencyKey: row.idempotency_key,
      createdAt: row.created_at,
      paidAt: row.paid_at
    })),
    paymentEvents: paymentEvents.map((row) => ({
      id: row.id,
      paymentId: row.payment_id,
      provider: row.provider,
      providerEventId: row.provider_event_id,
      status: row.status,
      rawPayload: row.raw_payload,
      createdAt: row.created_at
    })),
    nodes: nodes.map((row) => ({
      id: row.id,
      name: row.name,
      locationCode: row.location_code,
      provider: row.provider,
      publicHost: row.public_host,
      enabled: row.enabled
    })),
    auditLogs: auditLogs.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      createdAt: row.created_at
    })),
    supportTickets: supportTickets.map((row) => ({
      id: row.id,
      userId: row.user_id,
      subject: row.subject,
      message: row.message,
      status: row.status,
      createdAt: row.created_at
    })),
    telegramAccounts: telegramAccounts.map((row): TelegramAccount => ({
      telegramUserId: row.telegram_user_id,
      userId: row.user_id,
      username: row.username,
      linkedAt: row.linked_at
    })),
    telegramLinkTokens: telegramLinkTokens.map((row): TelegramLinkToken => ({
      token: row.token,
      userId: row.user_id,
      expiresAt: row.expires_at,
      usedAt: row.used_at
    })),
    driver: 'postgres'
  }
}

async function saveStore(pool: Pool, store: AppStore): Promise<void> {
  const client = await pool.connect()

  try {
    await client.query('begin')

    for (const user of store.users) {
      await client.query(
        `insert into users (
          id, email, name, password_hash, email_verified, role, blocked, notes, subscription_token, created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        on conflict (id) do update set
          email = excluded.email,
          name = excluded.name,
          password_hash = excluded.password_hash,
          email_verified = excluded.email_verified,
          role = excluded.role,
          blocked = excluded.blocked,
          notes = excluded.notes,
          subscription_token = excluded.subscription_token`,
        [
          user.id,
          user.email,
          user.name,
          user.passwordHash,
          user.emailVerified,
          user.role,
          user.blocked,
          user.notes,
          user.subscriptionToken,
          user.createdAt
        ]
      )
    }

    for (const token of store.emailTokens) {
      await client.query(
        `insert into email_verification_tokens (token, user_id, expires_at, resend_available_at, used_at)
         values ($1, $2, $3, $4, $5)
         on conflict (token) do update set
          user_id = excluded.user_id,
          expires_at = excluded.expires_at,
          resend_available_at = excluded.resend_available_at,
          used_at = excluded.used_at`,
        [token.token, token.userId, token.expiresAt, token.resendAvailableAt, token.usedAt]
      )
    }

    for (const plan of store.plans) {
      await client.query(
        `insert into plans (id, code, title, price_rub, duration_days, traffic_limit_gb, device_limit)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (id) do update set
          code = excluded.code,
          title = excluded.title,
          price_rub = excluded.price_rub,
          duration_days = excluded.duration_days,
          traffic_limit_gb = excluded.traffic_limit_gb,
          device_limit = excluded.device_limit`,
        [plan.id, plan.code, plan.title, plan.priceRub, plan.durationDays, plan.trafficLimitGb, plan.deviceLimit]
      )
    }

    for (const node of store.nodes) {
      await client.query(
        `insert into vpn_nodes (id, name, location_code, provider, public_host, enabled)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update set
          name = excluded.name,
          location_code = excluded.location_code,
          provider = excluded.provider,
          public_host = excluded.public_host,
          enabled = excluded.enabled`,
        [node.id, node.name, node.locationCode, node.provider, node.publicHost, node.enabled]
      )
    }

    for (const subscription of store.subscriptions) {
      await client.query(
        `insert into subscriptions (
          id, user_id, plan_id, status, starts_at, ends_at, grace_ends_at,
          traffic_used_bytes, traffic_limit_bytes, granted_by_admin_id
        )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (id) do update set
          status = excluded.status,
          ends_at = excluded.ends_at,
          grace_ends_at = excluded.grace_ends_at,
          traffic_used_bytes = excluded.traffic_used_bytes,
          traffic_limit_bytes = excluded.traffic_limit_bytes,
          granted_by_admin_id = excluded.granted_by_admin_id`,
        [
          subscription.id,
          subscription.userId,
          subscription.planId,
          subscription.status,
          subscription.startsAt,
          subscription.endsAt,
          subscription.graceEndsAt,
          subscription.trafficUsedBytes.toString(),
          subscription.trafficLimitBytes.toString(),
          subscription.grantedByAdminId
        ]
      )
    }

    for (const device of store.devices) {
      await client.query(
        `insert into devices (id, user_id, label, status, created_at, last_seen_at)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update set
          label = excluded.label,
          status = excluded.status,
          last_seen_at = excluded.last_seen_at`,
        [device.id, device.userId, device.label, device.status, device.createdAt, device.lastSeenAt]
      )
    }

    for (const credential of store.credentials) {
      await client.query(
        `insert into device_credentials (
          id, user_id, device_id, encrypted_payload, server_id, protocols, created_at, revoked_at
        )
         values ($1, $2, $3, $4, $5, $6::vpn_protocol[], $7, $8)
         on conflict (id) do update set
          encrypted_payload = excluded.encrypted_payload,
          server_id = excluded.server_id,
          protocols = excluded.protocols,
          revoked_at = excluded.revoked_at`,
        [
          credential.id,
          credential.userId,
          credential.deviceId,
          credential.encryptedPayload,
          credential.serverId,
          credential.protocols,
          credential.createdAt,
          credential.revokedAt
        ]
      )
      await client.query(
        `insert into credential_server_history (id, credential_id, server_id, assigned_at)
         values ($1, $2, $3, $4)
         on conflict (id) do nothing`,
        [`hist_${credential.id}`, credential.id, credential.serverId, credential.createdAt]
      )
    }

    for (const payment of store.payments) {
      await client.query(
        `insert into payments (
          id, user_id, plan_id, provider, provider_payment_id, status,
          amount_rub, checkout_url, idempotency_key, created_at, paid_at
        )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (id) do update set
          status = excluded.status,
          amount_rub = excluded.amount_rub,
          checkout_url = excluded.checkout_url,
          paid_at = excluded.paid_at`,
        [
          payment.id,
          payment.userId,
          payment.planId,
          payment.provider,
          payment.providerPaymentId,
          payment.status,
          payment.amountRub,
          payment.checkoutUrl,
          payment.idempotencyKey,
          payment.createdAt,
          payment.paidAt
        ]
      )
    }

    for (const event of store.paymentEvents) {
      await client.query(
        `insert into payment_events (
          id, payment_id, provider, provider_event_id, status, raw_payload, created_at
        )
         values ($1, $2, $3, $4, $5, $6::jsonb, $7)
         on conflict (id) do update set
          status = excluded.status,
          raw_payload = excluded.raw_payload`,
        [
          event.id,
          event.paymentId,
          event.provider,
          event.providerEventId,
          event.status,
          JSON.stringify(event.rawPayload),
          event.createdAt
        ]
      )
    }

    for (const entry of store.auditLogs) {
      await client.query(
        `insert into admin_action_logs (id, actor_user_id, action, target_type, target_id, created_at)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update set
          action = excluded.action,
          target_type = excluded.target_type,
          target_id = excluded.target_id`,
        [entry.id, entry.actorUserId, entry.action, entry.targetType, entry.targetId, entry.createdAt]
      )
    }

    for (const ticket of store.supportTickets) {
      await client.query(
        `insert into support_tickets (id, user_id, subject, message, status, created_at)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update set
          subject = excluded.subject,
          message = excluded.message,
          status = excluded.status`,
        [ticket.id, ticket.userId, ticket.subject, ticket.message, ticket.status, ticket.createdAt]
      )
    }

    for (const account of store.telegramAccounts) {
      await client.query(
        `insert into telegram_accounts (telegram_user_id, user_id, username, linked_at)
         values ($1, $2, $3, $4)
         on conflict (telegram_user_id) do update set
          user_id = excluded.user_id,
          username = excluded.username,
          linked_at = excluded.linked_at`,
        [account.telegramUserId, account.userId, account.username, account.linkedAt]
      )
    }

    for (const token of store.telegramLinkTokens) {
      await client.query(
        `insert into telegram_link_tokens (token, user_id, expires_at, used_at)
         values ($1, $2, $3, $4)
         on conflict (token) do update set
          user_id = excluded.user_id,
          expires_at = excluded.expires_at,
          used_at = excluded.used_at`,
        [token.token, token.userId, token.expiresAt, token.usedAt]
      )
    }

    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function rows<T extends QueryResultRow>(pool: Pool, sql: string): Promise<T[]> {
  const result = await pool.query<T>(sql)
  return result.rows
}
