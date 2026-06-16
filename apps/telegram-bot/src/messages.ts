import type { CustomerProfile } from '@vpn/api-contract'

export function startMessage(publicUrl: string): string {
  return [
    'VPN cabinet',
    '',
    'Manage subscription, devices and VPN access from one account.',
    '',
    `Register or sign in: ${publicUrl}/register`
  ].join('\n')
}

export function linkHelpMessage(publicUrl: string): string {
  return [
    'Link Telegram to your VPN account',
    '',
    'Open the web cabinet, generate a Telegram link token, then send:',
    '/link <token>',
    '',
    `Web cabinet: ${publicUrl}/profile/telegram`
  ].join('\n')
}

export function linkedMessage(email: string): string {
  return `Telegram linked to ${email}. Open /cabinet to manage your VPN access.`
}

export function profileMessage(profile: CustomerProfile): string {
  return [
    `Account: ${profile.email}`,
    `Subscription: ${profile.subscriptionStatus}`,
    `Devices: ${profile.deviceLimit}`,
    `Traffic: ${profile.trafficUsedGb}/${profile.trafficLimitGb} GB`,
    `Subscription link: ${profile.subscriptionUrl}`
  ].join('\n')
}
