import cors from '@elysiajs/cors'
import type {
  AdminAuditEntry,
  AdminUserListItem,
  CustomerDevice,
  CustomerProfile,
  PaymentProvider,
  TelegramCabinetProfile,
  TelegramLinkToken,
  PublicPlan
} from '@vpn/api-contract'
import { Elysia, t } from 'elysia'
import { createHmac } from 'node:crypto'
import { assertProductionConfig } from './lib/config'
import { AppError, notFound } from './lib/errors'
import { DEVICE_LIMIT, MVP_PROTOCOLS, type Device, type Payment, type Plan, type Subscription, type User } from './lib/domain'
import { createEmailSender, type EmailSender } from './lib/email'
import { createId, createToken } from './lib/id'
import { PlategaPaymentAdapter, TBankPaymentAdapter, paymentToInvoice, type CreateInvoiceInput } from './lib/payments'
import { ManualExternalProviderAdapter, MarzbanProviderAdapter } from './lib/providers'
import { hashPassword, signToken, verifyPassword, verifySignedToken, encryptJson, decryptJson } from './lib/security'
import { createDefaultStore, persistStore, type AppStore } from './lib/store'
import { createSubscription, evaluateSubscriptionStatus } from './lib/subscriptions'
import { addDays, bytesToGb, now, toIso } from './lib/time'

type CreateAppOptions = {
  store?: AppStore
  emailSender?: EmailSender
}

const tbank = new TBankPaymentAdapter()
const platega = new PlategaPaymentAdapter()

export async function createApp(options: CreateAppOptions = {}) {
  const store = options.store ?? (await createDefaultStore())
  assertProductionConfig(store)
  const emailSender = options.emailSender ?? createEmailSender()

  const app = new Elysia()
    .use(cors({ origin: true, credentials: true }))
    .onError(({ error, set }) => {
      if (error instanceof AppError) {
        set.status = error.status
        return error.toBody()
      }

      if (error instanceof Error && error.message.toLowerCase().includes('payment webhook')) {
        set.status = 400
        return { code: 'VALIDATION_ERROR', message: error.message }
      }

      set.status = 500
      return { code: 'VALIDATION_ERROR', message: 'Unexpected server error' }
    })
    .get('/health', () => ({
      ok: true,
      service: 'vpn-backend',
      version: '0.1.0'
    }))
    .get('/plans', () => store.plans.map(publicPlan))
    .post(
      '/auth/register',
      async ({ body, set }) => {
        const email = body.email.trim().toLowerCase()
        const existing = store.users.find((user) => user.email === email)
        if (existing?.emailVerified) {
          set.status = 409
          return { code: 'VALIDATION_ERROR', message: 'Email is already registered' }
        }

        const passwordHash = await hashPassword(body.password)
        const user: User = existing ?? {
          id: createId('usr'),
          email,
          name: body.name.trim(),
          passwordHash,
          emailVerified: false,
          role: 'customer',
          blocked: false,
          notes: null,
          subscriptionToken: createToken('subtok'),
          createdAt: now()
        }

        const verification = createEmailVerification(store, user)
        if ('error' in verification) {
          set.status = verification.status
          return { code: 'VALIDATION_ERROR', message: verification.error, resendAvailableAt: verification.resendAvailableAt.toISOString() }
        }

        if (existing) {
          existing.name = body.name.trim()
          existing.passwordHash = passwordHash
        } else {
          store.users.push(user)
        }

        try {
          await persistStore(store)
          await emailSender.sendVerificationEmail({
            to: user.email,
            name: user.name,
            code: verification.code,
            expiresAt: verification.expiresAt
          })
        } catch {
          if (!existing) {
            const userIndex = store.users.indexOf(user)
            if (userIndex >= 0) store.users.splice(userIndex, 1)
          }
          const tokenIndex = store.emailTokens.findIndex((item) => item.token === verification.token)
          if (tokenIndex >= 0) store.emailTokens.splice(tokenIndex, 1)
          await persistStore(store).catch(() => undefined)
          throw new AppError('VALIDATION_ERROR', 'Verification email could not be sent', 502)
        }

        set.status = 201
        return {
          userId: user.id,
          email: user.email,
          verificationEmailSent: true,
          resendAvailableAt: verification.resendAvailableAt.toISOString()
        }
      },
      {
        body: t.Object({
          email: t.String({ format: 'email' }),
          name: t.String({ minLength: 1 }),
          password: t.String({ minLength: 8 })
        })
      }
    )
    .post(
      '/auth/register/resend',
      async ({ body, set }) => {
        const email = body.email.trim().toLowerCase()
        const user = store.users.find((item) => item.email === email)
        if (!user) throw notFound('Account was not registered')
        if (user.emailVerified) {
          set.status = 409
          return { code: 'VALIDATION_ERROR', message: 'Email is already verified' }
        }

        const verification = createEmailVerification(store, user)
        if ('error' in verification) {
          set.status = verification.status
          return { code: 'VALIDATION_ERROR', message: verification.error, resendAvailableAt: verification.resendAvailableAt.toISOString() }
        }

        await persistStore(store)
        await emailSender.sendVerificationEmail({
          to: user.email,
          name: user.name,
          code: verification.code,
          expiresAt: verification.expiresAt
        })

        return {
          email: user.email,
          verificationEmailSent: true,
          resendAvailableAt: verification.resendAvailableAt.toISOString()
        }
      },
      {
        body: t.Object({
          email: t.String({ format: 'email' })
        })
      }
    )
    .post(
      '/auth/verify-email',
      async ({ body }) => {
        const email = body.email.trim().toLowerCase()
        const user = requireEntity(store.users.find((item) => item.email === email), 'User not found')
        const codeHash = emailVerificationCodeHash(email, body.code)
        const token = store.emailTokens.find((item) => item.userId === user.id && item.token === codeHash)
        if (!token || token.usedAt || token.expiresAt < now()) throw notFound('Verification code is invalid or expired')

        user.emailVerified = true
        token.usedAt = now()
        await persistStore(store)

        return { ok: true }
      },
      {
        body: t.Object({
          email: t.String({ format: 'email' }),
          code: t.String({ minLength: 6, maxLength: 6 })
        })
      }
    )
    .post(
      '/auth/login',
      async ({ body }) => {
        const user = store.users.find((item) => item.email === body.email.trim().toLowerCase())
        if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
          throw new AppError('AUTH_REQUIRED', 'Invalid email or password', 401)
        }
        if (user.blocked) throw new AppError('AUTH_REQUIRED', 'User is blocked', 403)
        if (!user.emailVerified) throw new AppError('EMAIL_NOT_VERIFIED', 'Verify email before login', 403)

        const token = signToken(`${user.id}:${Date.now()}`)
        store.sessions.set(token, user.id)

        return {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            emailVerified: user.emailVerified
          }
        }
      },
      {
        body: t.Object({
          email: t.String({ format: 'email' }),
          password: t.String()
        })
      }
    )
    .get('/me/profile', ({ headers }) => customerProfile(store, requireUser(store, headers.authorization)))
    .get('/me/devices', ({ headers }) => {
      const user = requireUser(store, headers.authorization)
      return activeDevices(store, user.id).map((device) => customerDevice(store, device))
    })
    .post(
      '/me/devices',
      async ({ headers, body, set }) => {
        const user = requireUser(store, headers.authorization)
        requireUsableSubscription(store, user.id)
        const devices = activeDevices(store, user.id)

        if (devices.length >= DEVICE_LIMIT) {
          set.status = 409
          return {
            code: 'DEVICE_LIMIT_REACHED',
            message: 'Device limit reached. Choose a device to replace.',
            replaceRequired: true,
            devices: devices.map((device) => customerDevice(store, device))
          }
        }

        const device = await createDeviceWithCredentials(store, user, body.label)
        await persistStore(store)
        return device
      },
      {
        body: t.Object({
          label: t.String({ minLength: 1 })
        })
      }
    )
    .post(
      '/me/devices/replace',
      async ({ headers, body }) => {
        const user = requireUser(store, headers.authorization)
        requireUsableSubscription(store, user.id)
        const replaced = requireEntity(
          store.devices.find((device) => device.id === body.replaceDeviceId && device.userId === user.id),
          'Device to replace was not found'
        )
        await revokeDeviceAccess(store, user, replaced)
        replaced.status = 'revoked'
        store.credentials
          .filter((credential) => credential.deviceId === replaced.id && !credential.revokedAt)
          .forEach((credential) => {
            credential.revokedAt = now()
          })

        const device = await createDeviceWithCredentials(store, user, body.label)
        await persistStore(store)
        return device
      },
      {
        body: t.Object({
          replaceDeviceId: t.String(),
          label: t.String({ minLength: 1 })
        })
      }
    )
    .delete('/me/devices/:id', async ({ headers, params }) => {
      const user = requireUser(store, headers.authorization)
      const device = requireEntity(
        store.devices.find((item) => item.id === params.id && item.userId === user.id),
        'Device not found'
      )
      await revokeDeviceAccess(store, user, device)
      device.status = 'revoked'
      store.credentials
        .filter((credential) => credential.deviceId === device.id && !credential.revokedAt)
        .forEach((credential) => {
          credential.revokedAt = now()
        })
      await persistStore(store)
      return { ok: true }
    })
    .post('/me/devices/:id/rotate', async ({ headers, params }) => {
      const user = requireUser(store, headers.authorization)
      requireUsableSubscription(store, user.id)
      const device = requireEntity(
        store.devices.find((item) => item.id === params.id && item.userId === user.id && item.status === 'active'),
        'Device not found'
      )
      await revokeDeviceAccess(store, user, device)
      store.credentials
        .filter((credential) => credential.deviceId === device.id && !credential.revokedAt)
        .forEach((credential) => {
          credential.revokedAt = now()
        })
      await provisionDevice(store, user, device)
      await persistStore(store)

      return customerDevice(store, device)
    })
    .post(
      '/payments/create',
      async ({ headers, body }) => {
        const user = requireUser(store, headers.authorization)
        if (!user.emailVerified) throw new AppError('EMAIL_NOT_VERIFIED', 'Verify email before payment', 403)
        const plan = requireEntity(store.plans.find((item) => item.id === body.planId), 'Plan not found')
        const idempotencyKey = body.idempotencyKey ?? createToken('idem')
        const existing = store.payments.find((payment) => payment.userId === user.id && payment.idempotencyKey === idempotencyKey)
        if (existing) return paymentToInvoice(existing)

        const invoice = await createInvoiceWithFallback(body.provider, {
          userId: user.id,
          planId: plan.id,
          amountRub: plan.priceRub,
          idempotencyKey,
          email: user.email
        })
        const payment: Payment = {
          id: invoice.id,
          userId: user.id,
          planId: plan.id,
          provider: invoice.provider,
          providerPaymentId: invoice.id,
          status: invoice.status,
          amountRub: invoice.amountRub,
          checkoutUrl: invoice.checkoutUrl,
          idempotencyKey,
          createdAt: now(),
          paidAt: null
        }
        store.payments.push(payment)
        await persistStore(store)

        return paymentToInvoice(payment)
      },
      {
        body: t.Object({
          planId: t.String(),
          provider: t.Optional(t.Union([t.Literal('tbank'), t.Literal('platega')])),
          idempotencyKey: t.Optional(t.String())
        })
      }
    )
    .post('/payments/webhooks/tbank', async ({ body, headers }) => {
      processPaymentWebhook(store, 'tbank', body, paymentSignature(headers))
      await persistStore(store)
      return 'OK'
    })
    .post('/payments/webhooks/platega', async ({ body, headers }) => {
      const result = processPaymentWebhook(store, 'platega', body, paymentSignature(headers))
      await persistStore(store)
      return result
    })
    .get('/sub/:token', ({ params, set }) => {
      const user = requireEntity(store.users.find((item) => item.subscriptionToken === params.token), 'Subscription token not found')
      requireUsableSubscription(store, user.id)
      const profiles = store.credentials
        .filter((credential) => credential.userId === user.id && !credential.revokedAt)
        .flatMap((credential) => decryptJson<{ uri: string }[]>(credential.encryptedPayload))
        .map((profile) => profile.uri)

      set.headers['content-type'] = 'text/plain; charset=utf-8'
      return profiles.join('\n')
    })
    .post(
      '/support/tickets',
      async ({ headers, body, set }) => {
        const user = requireUser(store, headers.authorization)
        const ticket = {
          id: createId('ticket'),
          userId: user.id,
          subject: body.subject,
          message: body.message,
          status: 'open' as const,
          createdAt: now()
        }
        store.supportTickets.push(ticket)
        await persistStore(store)
        set.status = 201
        return ticket
      },
      {
        body: t.Object({
          subject: t.String({ minLength: 1 }),
          message: t.String({ minLength: 1 })
        })
      }
    )
    .post('/telegram/link-token', async ({ headers }): Promise<TelegramLinkToken> => {
      const user = requireUser(store, headers.authorization)
      const token = createToken('tglink')
      const link = {
        token,
        userId: user.id,
        expiresAt: addDays(now(), 1),
        usedAt: null
      }
      store.telegramLinkTokens.push(link)
      await persistStore(store)

      return {
        token,
        expiresAt: link.expiresAt.toISOString()
      }
    })
    .post(
      '/telegram/link',
      async ({ headers, body }) => {
        requireTelegramBot(headers)
        const token = store.telegramLinkTokens.find((item) => item.token === body.token)
        if (!token || token.usedAt || token.expiresAt < now()) throw notFound('Telegram link token is invalid or expired')

        const user = requireEntity(store.users.find((item) => item.id === token.userId), 'User not found')
        token.usedAt = now()
        const existing = store.telegramAccounts.find((item) => item.telegramUserId === body.telegramUserId)
        if (existing) {
          existing.userId = user.id
          existing.username = body.username ?? null
          existing.linkedAt = now()
        } else {
          store.telegramAccounts.push({
            telegramUserId: body.telegramUserId,
            userId: user.id,
            username: body.username ?? null,
            linkedAt: now()
          })
        }
        await persistStore(store)

        return {
          ok: true,
          email: user.email
        }
      },
      {
        body: t.Object({
          token: t.String(),
          telegramUserId: t.String(),
          username: t.Optional(t.String())
        })
      }
    )
    .get('/telegram/profile/:telegramUserId', ({ headers, params }): TelegramCabinetProfile => {
      requireTelegramBot(headers)
      const account = requireEntity(
        store.telegramAccounts.find((item) => item.telegramUserId === params.telegramUserId),
        'Telegram account is not linked'
      )
      const user = requireEntity(store.users.find((item) => item.id === account.userId), 'User not found')

      return {
        ...customerProfile(store, user),
        telegramUserId: account.telegramUserId
      }
    })
    .get('/admin/users', ({ headers }) => {
      requireAdmin(store, headers.authorization)
      return store.users.map((user) => adminUser(store, user))
    })
    .post(
      '/admin/users/:id/grant',
      async ({ headers, params, body }) => {
        const admin = requireAdmin(store, headers.authorization)
        const user = requireEntity(store.users.find((item) => item.id === params.id), 'User not found')
        const plan = requireEntity(store.plans.find((item) => item.id === body.planId), 'Plan not found')
        grantSubscription(store, user.id, plan, admin.id)
        audit(store, admin.id, 'subscription.grant', 'user', user.id)
        await persistStore(store)
        return customerProfile(store, user)
      },
      {
        body: t.Object({
          planId: t.String()
        })
      }
    )
    .post('/admin/users/:id/block', async ({ headers, params }) => {
      const admin = requireAdmin(store, headers.authorization)
      const user = requireEntity(store.users.find((item) => item.id === params.id), 'User not found')
      user.blocked = true
      await revokeUserDevices(store, user)
      const subscription = currentSubscription(store, user.id)
      if (subscription) subscription.status = 'blocked'
      audit(store, admin.id, 'user.block', 'user', user.id)
      await persistStore(store)
      return adminUser(store, user)
    })
    .post(
      '/admin/users/:id/notes',
      async ({ headers, params, body }) => {
        const admin = requireAdmin(store, headers.authorization)
        const user = requireEntity(store.users.find((item) => item.id === params.id), 'User not found')
        user.notes = body.notes
        audit(store, admin.id, 'user.notes.update', 'user', user.id)
        await persistStore(store)
        return adminUser(store, user)
      },
      {
        body: t.Object({
          notes: t.String()
        })
      }
    )
    .get('/admin/audit', ({ headers }) => {
      requireAdmin(store, headers.authorization)
      return store.auditLogs.map((entry): AdminAuditEntry => {
        const actor = store.users.find((user) => user.id === entry.actorUserId)
        return {
          id: entry.id,
          actorEmail: actor?.email ?? 'unknown',
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          createdAt: entry.createdAt.toISOString()
        }
      })
    })
    .get('/admin/servers', ({ headers }) => {
      requireAdmin(store, headers.authorization)
      return store.nodes.map((node) => ({
        ...node,
        protocols: node.provider === 'manual-external' ? ['external-manual'] : MVP_PROTOCOLS,
        visibleToCustomer: false
      }))
    })

  return { app, store }
}

async function revokeUserDevices(store: AppStore, user: User): Promise<void> {
  for (const device of activeDevices(store, user.id)) {
    await revokeDeviceAccess(store, user, device)
    device.status = 'revoked'
    store.credentials
      .filter((credential) => credential.deviceId === device.id && !credential.revokedAt)
      .forEach((credential) => {
        credential.revokedAt = now()
      })
  }
}

async function revokeDeviceAccess(store: AppStore, user: User, device: Device): Promise<void> {
  const activeCredentials = store.credentials.filter((credential) => credential.deviceId === device.id && !credential.revokedAt)

  for (const credential of activeCredentials) {
    const node = store.nodes.find((item) => item.id === credential.serverId)
    if (!node) continue

    if (node.provider === 'marzban') {
      const provider = new MarzbanProviderAdapter({ nodeId: node.id, host: node.publicHost })
      await provider.revoke({ userId: user.id, deviceId: device.id })
    } else {
      const provider = new ManualExternalProviderAdapter()
      await provider.revoke({ userId: user.id, deviceId: device.id })
    }
  }
}

export type App = Awaited<ReturnType<typeof createApp>>['app']

function publicPlan(plan: Plan): PublicPlan {
  return {
    id: plan.id,
    code: plan.code,
    title: plan.title,
    priceRub: plan.priceRub,
    durationDays: plan.durationDays,
    trafficLimitGb: plan.trafficLimitGb,
    deviceLimit: plan.deviceLimit
  }
}

function requireUser(store: AppStore, authorization: string | undefined): User {
  if (!authorization?.startsWith('Bearer ')) throw new AppError('AUTH_REQUIRED', 'Authorization token is required', 401)

  const token = authorization.slice('Bearer '.length)
  if (!verifySignedToken(token)) throw new AppError('AUTH_REQUIRED', 'Authorization token is invalid', 401)

  const userId = store.sessions.get(token)
  const user = userId ? store.users.find((item) => item.id === userId) : null
  if (!user) throw new AppError('AUTH_REQUIRED', 'Session not found', 401)
  if (user.blocked) throw new AppError('AUTH_REQUIRED', 'User is blocked', 403)

  return user
}

function requireAdmin(store: AppStore, authorization: string | undefined): User {
  const user = requireUser(store, authorization)
  if (!['owner', 'admin', 'support'].includes(user.role)) throw new AppError('AUTH_REQUIRED', 'Admin role is required', 403)
  return user
}

function requireTelegramBot(headers: Record<string, string | undefined>): void {
  const configuredSecret = process.env.TELEGRAM_BOT_SECRET
  if (!configuredSecret && process.env.NODE_ENV !== 'production') return
  if (!configuredSecret) throw new AppError('AUTH_REQUIRED', 'Telegram bot secret is not configured', 500)
  if (headers['x-telegram-bot-secret'] !== configuredSecret) {
    throw new AppError('AUTH_REQUIRED', 'Telegram bot secret is invalid', 401)
  }
}

function requireEntity<T>(value: T | undefined | null, message: string): T {
  if (!value) throw notFound(message)
  return value
}

function currentSubscription(store: AppStore, userId: string): Subscription | null {
  const subscription = store.subscriptions
    .filter((item) => item.userId === userId)
    .sort((left, right) => right.endsAt.getTime() - left.endsAt.getTime())[0]

  if (!subscription) return null
  subscription.status = evaluateSubscriptionStatus(subscription, now())
  return subscription
}

function requireUsableSubscription(store: AppStore, userId: string): Subscription {
  const subscription = currentSubscription(store, userId)
  if (!subscription) throw new AppError('AUTH_REQUIRED', 'Active subscription is required', 403)
  if (subscription.status === 'traffic_over_limit') {
    throw new AppError('TRAFFIC_LIMIT_REACHED', 'Traffic limit reached. Buy extra traffic or renew the plan.', 402)
  }
  if (!['active', 'grace'].includes(subscription.status)) {
    throw new AppError('AUTH_REQUIRED', 'Subscription is not active', 403)
  }
  return subscription
}

function customerProfile(store: AppStore, user: User): CustomerProfile {
  const subscription = currentSubscription(store, user.id)
  const plan = subscription ? store.plans.find((item) => item.id === subscription.planId) : null

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    subscriptionStatus: subscription?.status ?? 'expired',
    subscriptionEndsAt: toIso(subscription?.endsAt ?? null),
    trafficUsedGb: subscription ? bytesToGb(subscription.trafficUsedBytes) : 0,
    trafficLimitGb: plan?.trafficLimitGb ?? 0,
    deviceLimit: plan?.deviceLimit ?? DEVICE_LIMIT,
    subscriptionUrl: `/sub/${user.subscriptionToken}`
  }
}

function customerDevice(store: AppStore, device: Device): CustomerDevice {
  const credential = store.credentials.find((item) => item.deviceId === device.id && !item.revokedAt)
  const node = credential ? store.nodes.find((item) => item.id === credential.serverId) : null

  return {
    id: device.id,
    label: device.label,
    status: device.status,
    createdAt: device.createdAt.toISOString(),
    lastSeenAt: toIso(device.lastSeenAt),
    serverName: node?.name ?? null,
    protocols: credential?.protocols ?? []
  }
}

function adminUser(store: AppStore, user: User): AdminUserListItem {
  const profile = customerProfile(store, user)

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    subscriptionStatus: profile.subscriptionStatus,
    subscriptionEndsAt: profile.subscriptionEndsAt,
    trafficUsedGb: profile.trafficUsedGb,
    trafficLimitGb: profile.trafficLimitGb,
    deviceCount: activeDevices(store, user.id).length,
    notes: user.notes
  }
}

function activeDevices(store: AppStore, userId: string): Device[] {
  return store.devices.filter((device) => device.userId === userId && device.status === 'active')
}

async function createDeviceWithCredentials(store: AppStore, user: User, label: string): Promise<CustomerDevice> {
  const device: Device = {
    id: createId('dev'),
    userId: user.id,
    label,
    status: 'active',
    createdAt: now(),
    lastSeenAt: null
  }
  store.devices.push(device)
  await provisionDevice(store, user, device)
  return customerDevice(store, device)
}

async function provisionDevice(store: AppStore, user: User, device: Device): Promise<void> {
  const subscription = requireUsableSubscription(store, user.id)
  const input = {
    userId: user.id,
    deviceId: device.id,
    label: device.label,
    protocols: MVP_PROTOCOLS,
    trafficLimitGb: bytesToGb(subscription.trafficLimitBytes)
  }

  const primaryNode = store.nodes.find((item) => item.enabled && item.provider === 'marzban')
  const fallbackNode = store.nodes.find((item) => item.enabled && item.provider === 'manual-external')
  const provisioned = primaryNode ? await tryProvisionOnMarzban(primaryNode, input) : null
  const resolved = provisioned ?? (fallbackNode ? await provisionOnManualFallback(fallbackNode, input) : null)

  if (!resolved) throw notFound('VPN node not found')
  const { node, profiles } = resolved
  const protocols = profiles.map((profile) => profile.protocol)

  store.credentials.push({
    id: createId('cred'),
    userId: user.id,
    deviceId: device.id,
    encryptedPayload: encryptJson(profiles),
    serverId: node.id,
    protocols,
    createdAt: now(),
    revokedAt: null
  })
}

type ProvisionInput = {
  userId: string
  deviceId: string
  label: string
  protocols: typeof MVP_PROTOCOLS
  trafficLimitGb: number
}

async function tryProvisionOnMarzban(node: { id: string; publicHost: string }, input: ProvisionInput) {
  try {
    if (process.env.MARZBAN_FORCE_DOWN === 'true') throw new Error('Marzban is forced down')
    const provider = new MarzbanProviderAdapter({ nodeId: node.id, host: node.publicHost })
    const profiles = await provider.provision(input)
    return profiles.length > 0 ? { node, profiles } : null
  } catch {
    return null
  }
}

async function provisionOnManualFallback(node: { id: string; publicHost: string }, input: ProvisionInput) {
  const provider = new ManualExternalProviderAdapter()
  const profiles = await provider.provision(input)
  return profiles.length > 0 ? { node, profiles } : null
}

async function createInvoiceWithFallback(provider: Exclude<PaymentProvider, 'manual'> | undefined, input: CreateInvoiceInput) {
  const primary = paymentAdapter(provider ?? 'tbank')

  try {
    return await primary.createInvoice(input)
  } catch (error) {
    if (provider || primary.id !== 'tbank') throw error
    return platega.createInvoice(input)
  }
}

function paymentAdapter(provider: PaymentProvider) {
  if (provider === 'tbank') return tbank
  if (provider === 'manual') throw new AppError('PAYMENT_PROVIDER_ERROR', 'Manual provider cannot create invoices', 400)
  return platega
}

function processPaymentWebhook(
  store: AppStore,
  provider: Exclude<PaymentProvider, 'manual'>,
  payload: unknown,
  signature?: string
) {
  const adapter = paymentAdapter(provider)
  const parsed = adapter.parseWebhook(payload, signature)
  const payment = requireEntity(
    store.payments.find((item) => item.provider === provider && item.providerPaymentId === parsed.providerPaymentId),
    'Payment not found'
  )
  const duplicateEvent = store.paymentEvents.some(
    (event) => event.provider === provider && event.providerEventId === parsed.providerEventId
  )

  if (!duplicateEvent) {
    store.paymentEvents.push({
      id: createId('pevt'),
      paymentId: payment.id,
      provider,
      providerEventId: parsed.providerEventId,
      status: parsed.status,
      rawPayload: parsed.rawPayload,
      createdAt: now()
    })
  }

  if (parsed.status === 'paid' && payment.status !== 'paid') {
    payment.status = 'paid'
    payment.paidAt = now()
    const plan = requireEntity(store.plans.find((item) => item.id === payment.planId), 'Plan not found')
    grantSubscription(store, payment.userId, plan, null)
  } else if (parsed.status !== 'paid') {
    payment.status = parsed.status
  }

  return {
    ok: true,
    duplicate: duplicateEvent,
    payment: paymentToInvoice(payment)
  }
}

function paymentSignature(headers: Record<string, string | undefined>): string | undefined {
  return headers['x-signature'] ?? headers['x-payment-signature'] ?? headers['x-platega-signature'] ?? headers['x-tbank-signature']
}

function createEmailVerification(
  store: AppStore,
  user: User
): { token: string; code: string; expiresAt: Date; resendAvailableAt: Date } | { error: string; status: number; resendAvailableAt: Date } {
  const current = now()
  const existing = store.emailTokens.find((item) => item.userId === user.id && !item.usedAt && item.expiresAt > current)
  if (existing && existing.resendAvailableAt > current) {
    return {
      status: 429,
      error: 'Verification code can be resent later',
      resendAvailableAt: existing.resendAvailableAt
    }
  }

  const code = emailVerificationCode()
  const expiresAt = new Date(current.getTime() + emailVerificationTtlMinutes() * 60_000)
  const resendAvailableAt = new Date(current.getTime() + emailVerificationResendCooldownSeconds() * 1000)
  const token = emailVerificationCodeHash(user.email, code)
  store.emailTokens
    .filter((item) => item.userId === user.id && !item.usedAt)
    .forEach((item) => {
      item.usedAt = current
    })
  store.emailTokens.push({
    token,
    userId: user.id,
    expiresAt,
    resendAvailableAt,
    usedAt: null
  })

  return { token, code, expiresAt, resendAvailableAt }
}

function emailVerificationCode(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
  return String(value % 1_000_000).padStart(6, '0')
}

function emailVerificationCodeHash(email: string, code: string): string {
  const secret = process.env.EMAIL_VERIFICATION_SECRET ?? process.env.JWT_ACCESS_SECRET ?? 'dev-email-verification-secret'
  return createHmac('sha256', secret)
    .update(`${email.trim().toLowerCase()}:${code.trim()}`)
    .digest('base64url')
}

function emailVerificationTtlMinutes(): number {
  const value = Number(process.env.EMAIL_VERIFICATION_TTL_MIN ?? 15)
  return Number.isFinite(value) && value > 0 ? value : 15
}

function emailVerificationResendCooldownSeconds(): number {
  const value = Number(process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SEC ?? 60)
  return Number.isFinite(value) && value > 0 ? value : 60
}

function grantSubscription(store: AppStore, userId: string, plan: Plan, adminId: string | null): Subscription {
  store.subscriptions
    .filter((item) => item.userId === userId && ['active', 'grace', 'traffic_over_limit'].includes(item.status))
    .forEach((item) => {
      item.status = 'expired'
    })

  const subscription = createSubscription({
    userId,
    plan,
    startsAt: now(),
    grantedByAdminId: adminId
  })
  store.subscriptions.push(subscription)
  return subscription
}

function audit(store: AppStore, actorUserId: string, action: string, targetType: string, targetId: string): void {
  store.auditLogs.push({
    id: createId('audit'),
    actorUserId,
    action,
    targetType,
    targetId,
    createdAt: now()
  })
}
