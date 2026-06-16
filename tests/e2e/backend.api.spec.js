import { expect, test } from '@playwright/test'

test('backend API supports the paid subscription and device path', async ({ request }) => {
  const email = `api-${Date.now()}@example.com`
  const registered = await request.post('http://127.0.0.1:3001/auth/register', {
    data: { email, name: 'API User', password: 'password123' }
  })
  expect(registered.ok()).toBeTruthy()
  const registration = await registered.json()

  const verified = await request.post('http://127.0.0.1:3001/auth/verify-email', {
    data: { token: registration.verificationToken }
  })
  expect(verified.ok()).toBeTruthy()

  const loggedIn = await request.post('http://127.0.0.1:3001/auth/login', {
    data: { email, password: 'password123' }
  })
  expect(loggedIn.ok()).toBeTruthy()
  const login = await loggedIn.json()

  const invoiceResponse = await request.post('http://127.0.0.1:3001/payments/create', {
    headers: { authorization: `Bearer ${login.token}` },
    data: { planId: 'plan_starter', idempotencyKey: `e2e-${email}` }
  })
  expect(invoiceResponse.ok()).toBeTruthy()
  const invoice = await invoiceResponse.json()

  const paid = await request.post('http://127.0.0.1:3001/payments/webhooks/platega', {
    data: { paymentId: invoice.id, eventId: `evt-${email}`, status: 'paid' }
  })
  expect(paid.ok()).toBeTruthy()

  const device = await request.post('http://127.0.0.1:3001/me/devices', {
    headers: { authorization: `Bearer ${login.token}` },
    data: { label: 'API laptop' }
  })
  expect(device.ok()).toBeTruthy()
  const body = await device.json()

  expect(body.protocols).toEqual(['vless-reality', 'trojan-tls', 'shadowsocks'])
})
