import { expect, test } from 'bun:test'
import type { VpnCredentialInput, VpnRevokeInput } from '../src'

test('provider contract supports a single request with multiple protocols', () => {
  const input: VpnCredentialInput = {
    userId: 'user_1',
    deviceId: 'device_1',
    label: 'Laptop',
    protocols: ['vless-reality', 'trojan-tls', 'shadowsocks'],
    trafficLimitGb: 300
  }

  expect(input.protocols).toContain('vless-reality')
  expect(input.protocols).toContain('trojan-tls')
  expect(input.protocols).toContain('shadowsocks')
})

test('provider contract revokes by user and device', () => {
  const input: VpnRevokeInput = {
    userId: 'user_1',
    deviceId: 'device_1'
  }

  expect(input.userId).toBe('user_1')
  expect(input.deviceId).toBe('device_1')
})
