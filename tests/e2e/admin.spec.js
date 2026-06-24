import { expect, test } from '@playwright/test'
import { adminUrl } from './urls.js'

test('admin can inspect clients, grant subscription and see audit entries', async ({ page }) => {
  await page.goto(adminUrl('/'))
  await page.getByTestId('admin-email').fill('owner@vpn.local')
  await page.getByTestId('admin-password').fill('changeme')
  await page.getByTestId('admin-login').click()

  await expect(page.getByTestId('admin-users')).toContainText('owner@vpn.local')
  await expect(page.getByTestId('admin-servers')).toContainText('marzban')

  await page.getByTestId('admin-grant').click()
  await expect(page.getByTestId('admin-notice')).toContainText('Subscription granted')
  await expect(page.getByTestId('admin-audit')).toContainText('subscription.grant')

  await page.getByTestId('admin-notes').fill('VIP support note')
  await page.getByTestId('admin-save-notes').click()
  await expect(page.getByTestId('admin-users')).toContainText('VIP support note')
})
