import { describe, expect, test } from 'bun:test'
import { createApp } from '../src/app'
import { addTraffic } from '../src/lib/subscriptions'
import { addDays } from '../src/lib/time'

type RegisterResponse = {
  userId: string
  verificationToken: string
}

type LoginResponse = {
  token: string
  user: {
    id: string
    email: string
  }
}

type InvoiceResponse = {
  id: string
  checkoutUrl: string
}

type DeviceResponse = {
  id: string
  label: string
  protocols: string[]
}

type DeviceLimitResponse = {
  code: string
  replaceRequired: boolean
  devices: DeviceResponse[]
}

describe('backend API e2e', () => {
  test('registers, verifies, pays and exposes one subscription URL with all MVP protocols', async () => {
    const { app } = await createApp()
    const registered = await json<RegisterResponse>(
      app.handle(request('POST', '/auth/register', { email: 'user@example.com', name: 'User', password: 'password123' }))
    )

    expect(registered.verificationToken).toStartWith('verify_')

    await json(app.handle(request('POST', '/auth/verify-email', { token: registered.verificationToken })))
    const loggedIn = await json<LoginResponse>(
      app.handle(request('POST', '/auth/login', { email: 'user@example.com', password: 'password123' }))
    )
    const invoice = await json<InvoiceResponse>(
      app.handle(
        request('POST', '/payments/create', { planId: 'plan_starter', idempotencyKey: 'first-payment' }, loggedIn.token)
      )
    )

    await json(
      app.handle(
        request('POST', '/payments/webhooks/platega', {
          paymentId: invoice.id,
          eventId: 'evt_paid_1',
          status: 'paid'
        })
      )
    )

    const device = await json<DeviceResponse>(app.handle(request('POST', '/me/devices', { label: 'Laptop' }, loggedIn.token)))
    expect(device.protocols).toEqual(['vless-reality', 'trojan-tls', 'shadowsocks'])

    const profile = await json<{ subscriptionUrl: string; subscriptionStatus: string }>(
      app.handle(request('GET', '/me/profile', undefined, loggedIn.token))
    )
    expect(profile.subscriptionStatus).toBe('active')

    const subscription = await text(app.handle(request('GET', profile.subscriptionUrl, undefined, loggedIn.token)))
    expect(subscription).toContain('vless://')
    expect(subscription).toContain('trojan://')
    expect(subscription).toContain('ss://')
  })

  test('keeps payment webhooks idempotent', async () => {
    const { app, store } = await createApp()
    const token = await registeredVerifiedToken(app, 'pay@example.com')
    const invoice = await json<InvoiceResponse>(
      app.handle(request('POST', '/payments/create', { planId: 'plan_starter', idempotencyKey: 'same-key' }, token))
    )

    await json(app.handle(request('POST', '/payments/webhooks/platega', paidWebhook(invoice.id, 'evt_same'))))
    const duplicate = await json<{ duplicate: boolean }>(
      app.handle(request('POST', '/payments/webhooks/platega', paidWebhook(invoice.id, 'evt_same')))
    )

    expect(duplicate.duplicate).toBe(true)
    expect(store.paymentEvents).toHaveLength(1)
    expect(store.subscriptions.filter((subscription) => subscription.userId !== store.users[0]?.id)).toHaveLength(1)
  })

  test('links Telegram account to an existing web account', async () => {
    const { app } = await createApp()
    const token = await registeredVerifiedToken(app, 'telegram@example.com')
    const linkToken = await json<{ token: string }>(app.handle(request('POST', '/telegram/link-token', undefined, token)))

    const linked = await json<{ ok: boolean; email: string }>(
      app.handle(
        request('POST', '/telegram/link', {
          token: linkToken.token,
          telegramUserId: '12345',
          username: 'vpn_user'
        })
      )
    )
    const profile = await json<{ email: string; telegramUserId: string }>(
      app.handle(request('GET', '/telegram/profile/12345'))
    )

    expect(linked.ok).toBe(true)
    expect(linked.email).toBe('telegram@example.com')
    expect(profile.email).toBe('telegram@example.com')
    expect(profile.telegramUserId).toBe('12345')
  })

  test('requires explicit choice when adding a fifth device and then replaces selected device', async () => {
    const { app } = await createApp()
    const token = await paidUserToken(app, 'devices@example.com')
    const created: DeviceResponse[] = []

    for (const label of ['Phone', 'Laptop', 'Tablet', 'Router']) {
      created.push(await json<DeviceResponse>(app.handle(request('POST', '/me/devices', { label }, token))))
    }

    const fifthResponse = await app.handle(request('POST', '/me/devices', { label: 'Travel phone' }, token))
    const fifth = await json<DeviceLimitResponse>(fifthResponse)

    expect(fifthResponse.status).toBe(409)
    expect(fifth.replaceRequired).toBe(true)
    expect(fifth.devices).toHaveLength(4)

    const replacement = await json<DeviceResponse>(
      app.handle(
        request('POST', '/me/devices/replace', { replaceDeviceId: created[0]?.id, label: 'Travel phone' }, token)
      )
    )
    const devices = await json<DeviceResponse[]>(app.handle(request('GET', '/me/devices', undefined, token)))

    expect(replacement.label).toBe('Travel phone')
    expect(devices).toHaveLength(4)
    expect(devices.some((device) => device.label === 'Phone')).toBe(false)
  })

  test('revokes device credentials when a user deletes a device', async () => {
    const { app } = await createApp()
    const token = await paidUserToken(app, 'delete-device@example.com')
    const device = await json<DeviceResponse>(app.handle(request('POST', '/me/devices', { label: 'Old phone' }, token)))
    const profile = await json<{ subscriptionUrl: string }>(app.handle(request('GET', '/me/profile', undefined, token)))

    const beforeDelete = await text(app.handle(request('GET', profile.subscriptionUrl, undefined, token)))
    expect(beforeDelete).toContain('Old%20phone')

    await json(app.handle(request('DELETE', `/me/devices/${device.id}`, undefined, token)))
    const afterDelete = await text(app.handle(request('GET', profile.subscriptionUrl, undefined, token)))

    expect(afterDelete).toBe('')
  })

  test('falls back to an external manual provider when Marzban is unavailable', async () => {
    const { app, store } = await createApp()
    store.nodes
      .filter((node) => node.provider === 'marzban')
      .forEach((node) => {
        node.enabled = false
      })

    const token = await paidUserToken(app, 'fallback@example.com')
    const device = await json<DeviceResponse>(
      app.handle(request('POST', '/me/devices', { label: 'Fallback laptop' }, token))
    )
    const profile = await json<{ subscriptionUrl: string }>(app.handle(request('GET', '/me/profile', undefined, token)))
    const subscription = await text(app.handle(request('GET', profile.subscriptionUrl, undefined, token)))

    expect(device.protocols).toEqual(['external-manual'])
    expect(subscription).toContain('https://fallback.vpn.local/sub/')
  })

  test('blocks provisioning after user-level traffic limit is reached', async () => {
    const { app, store } = await createApp()
    const token = await paidUserToken(app, 'traffic@example.com')
    const customer = store.users.find((user) => user.email === 'traffic@example.com')
    const subscription = store.subscriptions.find((item) => item.userId === customer?.id)
    expect(subscription).toBeDefined()

    if (!subscription) throw new Error('subscription was not created')
    const overLimit = addTraffic(subscription, subscription.trafficLimitBytes)
    Object.assign(subscription, overLimit)

    const response = await app.handle(request('POST', '/me/devices', { label: 'Blocked laptop' }, token))
    const body = await json<{ code: string; message: string }>(response)

    expect(response.status).toBe(402)
    expect(body.code).toBe('TRAFFIC_LIMIT_REACHED')
    expect(body.message).toContain('Buy extra traffic')
  })

  test('allows grace period for one day and expires after grace', async () => {
    const { app, store } = await createApp()
    const token = await paidUserToken(app, 'grace@example.com')
    const customer = store.users.find((user) => user.email === 'grace@example.com')
    const subscription = store.subscriptions.find((item) => item.userId === customer?.id)
    expect(subscription).toBeDefined()

    if (!subscription) throw new Error('subscription was not created')
    subscription.endsAt = new Date(Date.now() - 12 * 60 * 60 * 1000)
    subscription.graceEndsAt = new Date(Date.now() + 12 * 60 * 60 * 1000)

    const graceDevice = await app.handle(request('POST', '/me/devices', { label: 'Grace device' }, token))
    expect(graceDevice.status).toBe(200)

    subscription.endsAt = addDays(new Date(), -2)
    subscription.graceEndsAt = addDays(new Date(), -1)

    const expiredDevice = await app.handle(request('POST', '/me/devices', { label: 'Expired device' }, token))
    expect(expiredDevice.status).toBe(403)
  })
})

function request(method: string, path: string, body?: unknown, token?: string): Request {
  const headers = new Headers()
  headers.set('content-type', 'application/json')
  if (token) headers.set('authorization', `Bearer ${token}`)
  const init: RequestInit = {
    method,
    headers
  }

  if (body !== undefined) init.body = JSON.stringify(body)

  return new Request(`http://localhost${path}`, init)
}

async function json<T = unknown>(responseOrPromise: Response | Promise<Response>): Promise<T> {
  const response = await responseOrPromise
  return (await response.json()) as T
}

async function text(responseOrPromise: Response | Promise<Response>): Promise<string> {
  const response = await responseOrPromise
  return response.text()
}

async function registeredVerifiedToken(app: Awaited<ReturnType<typeof createApp>>['app'], email: string): Promise<string> {
  const registered = await json<RegisterResponse>(
    app.handle(request('POST', '/auth/register', { email, name: 'User', password: 'password123' }))
  )
  await json(app.handle(request('POST', '/auth/verify-email', { token: registered.verificationToken })))
  const loggedIn = await json<LoginResponse>(app.handle(request('POST', '/auth/login', { email, password: 'password123' })))
  return loggedIn.token
}

async function paidUserToken(app: Awaited<ReturnType<typeof createApp>>['app'], email: string): Promise<string> {
  const token = await registeredVerifiedToken(app, email)
  const invoice = await json<InvoiceResponse>(
    app.handle(request('POST', '/payments/create', { planId: 'plan_starter', idempotencyKey: `payment-${email}` }, token))
  )
  await json(app.handle(request('POST', '/payments/webhooks/platega', paidWebhook(invoice.id, `evt-${email}`))))
  return token
}

function paidWebhook(paymentId: string, eventId: string) {
  return {
    paymentId,
    eventId,
    status: 'paid'
  }
}
