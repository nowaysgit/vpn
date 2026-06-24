import { expect, test } from '@playwright/test'
import { verificationEmailFor } from './email-outbox.js'
import { apiUrl } from './urls.js'

test('backend API supports the paid subscription and device path', async ({ request }) => {
  const email = `api-${Date.now()}@example.com`
  const registered = await request.post(apiUrl('/auth/register'), {
    data: { email, name: 'API User', password: 'password123' }
  })
  expect(registered.ok()).toBeTruthy()
  const registration = await registered.json()
  expect(registration.verificationEmailSent).toBeTruthy()
  expect(registration.verificationToken).toBeUndefined()
  const verificationEmail = await verificationEmailFor(email)

  const verified = await request.post(apiUrl('/auth/verify-email'), {
    data: { email, code: verificationEmail.code }
  })
  expect(verified.ok()).toBeTruthy()

  const loggedIn = await request.post(apiUrl('/auth/login'), {
    data: { email, password: 'password123' }
  })
  expect(loggedIn.ok()).toBeTruthy()
  const login = await loggedIn.json()

  const invoiceResponse = await request.post(apiUrl('/payments/create'), {
    headers: { authorization: `Bearer ${login.token}` },
    data: { planId: 'plan_starter', idempotencyKey: `e2e-${email}` }
  })
  expect(invoiceResponse.ok()).toBeTruthy()
  const invoice = await invoiceResponse.json()

  expect(invoice.provider).toBe('tbank')

  const paid = await request.post(apiUrl('/payments/webhooks/tbank'), {
    data: { PaymentId: invoice.id, Status: 'CONFIRMED', Success: true, Amount: invoice.amountRub * 100 }
  })
  expect(paid.ok()).toBeTruthy()
  expect(await paid.text()).toBe('OK')

  const device = await request.post(apiUrl('/me/devices'), {
    headers: { authorization: `Bearer ${login.token}` },
    data: { label: 'API laptop' }
  })
  expect(device.ok()).toBeTruthy()
  const body = await device.json()

  expect(body.protocols).toEqual(['vless-reality', 'trojan-tls', 'shadowsocks'])
})
