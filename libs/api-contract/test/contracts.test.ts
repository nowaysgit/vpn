import { expect, test } from 'bun:test'
import type { PublicPlan, VpnProtocol } from '../src'

test('public plan contract keeps traffic limit at user level', () => {
  const plan: PublicPlan = {
    id: 'plan_1',
    code: 'starter',
    title: 'Starter',
    priceRub: 299,
    durationDays: 30,
    trafficLimitGb: 200,
    deviceLimit: 4
  }

  expect(plan.trafficLimitGb).toBe(200)
  expect(plan.deviceLimit).toBe(4)
})

test('MVP protocol contract includes all subscription protocols', () => {
  const protocols: VpnProtocol[] = ['vless-reality', 'trojan-tls', 'shadowsocks']

  expect(protocols).toHaveLength(3)
})
