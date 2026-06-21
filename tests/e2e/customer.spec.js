import { expect, test } from '@playwright/test'
import { verificationEmailFor } from './email-outbox.js'

test('customer can register, pay, copy subscription and replace fifth device', async ({ page }) => {
  const email = `ui-${Date.now()}@example.com`

  await page.goto('http://127.0.0.1:3000')
  await page.getByTestId('email').fill(email)
  await page.getByTestId('name').fill('UI User')
  await page.getByTestId('password').fill('password123')
  await page.getByTestId('register').click()
  await expect(page.getByTestId('notice')).toContainText('Account created')

  const verificationEmail = await verificationEmailFor(email)
  await page.goto(verificationEmail.verificationUrl)
  await expect(page.getByTestId('notice')).toContainText('Email verified')

  await page.getByTestId('email').fill(email)
  await page.getByTestId('password').fill('password123')
  await page.getByTestId('login').click()
  await page.getByTestId('create-payment').click()
  await expect(page.getByTestId('invoice')).toContainText('tbank')
  await page.getByTestId('sandbox-paid').click()
  await expect(page.getByTestId('subscription-status')).toContainText('active')

  for (const label of ['Phone', 'Laptop', 'Tablet', 'Router']) {
    await page.getByTestId('device-label').fill(label)
    await page.getByTestId('add-device').click()
    await expect(page.getByTestId('device-list')).toContainText(label)
  }

  await page.getByTestId('device-label').fill('Travel phone')
  await page.getByTestId('add-device').click()
  await expect(page.getByTestId('notice')).toContainText('Choose a device to replace')
  await page.getByTestId('replace-device').click()
  await expect(page.getByTestId('device-list')).toContainText('Travel phone')

  await page.getByTestId('telegram-link-token').click()
  await expect(page.getByTestId('telegram-token')).toHaveValue(/tglink_/)

  await expect(page.getByTestId('subscription-link')).toHaveValue(/\/sub\/subtok_/)
})
