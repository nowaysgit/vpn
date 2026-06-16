import { expect, test } from 'bun:test'
import { linkHelpMessage, linkedMessage, profileMessage, startMessage } from '../src/messages'

test('start message sends unregistered users to web registration', () => {
  expect(startMessage('https://vpn.example.com')).toContain('https://vpn.example.com/register')
})

test('profile message includes subscription link', () => {
  const text = profileMessage({
    id: 'usr_1',
    email: 'user@example.com',
    name: 'User',
    emailVerified: true,
    subscriptionStatus: 'active',
    subscriptionEndsAt: new Date().toISOString(),
    trafficUsedGb: 10,
    trafficLimitGb: 200,
    deviceLimit: 4,
    subscriptionUrl: '/sub/token'
  })

  expect(text).toContain('/sub/token')
})

test('link help tells users how to connect Telegram', () => {
  expect(linkHelpMessage('https://vpn.example.com')).toContain('/link <token>')
})

test('linked message confirms target account email', () => {
  expect(linkedMessage('user@example.com')).toContain('user@example.com')
})
