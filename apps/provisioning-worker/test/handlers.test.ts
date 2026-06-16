import { expect, test } from 'bun:test'
import type { VpnProviderAdapter } from '@vpn/provider-contract'
import { handleProvisioningJob } from '../src/handlers'
import { provisioningQueues } from '../src/jobs'

test('sync job reports provider health and usage snapshots', async () => {
  const provider: VpnProviderAdapter = {
    id: 'fake',
    async health() {
      return { ok: true, provider: 'fake', checkedAt: new Date(), message: 'healthy' }
    },
    async provision() {
      return []
    },
    async revoke() {
      return
    },
    async rotate() {
      return []
    },
    async syncUsage() {
      return [
        {
          userId: 'user_1',
          deviceId: 'device_1',
          trafficUsedBytes: 10n,
          activeConnections: 1,
          sampledAt: new Date()
        }
      ]
    }
  }

  const result = await handleProvisioningJob({
    queue: provisioningQueues.syncMarzban,
    payload: { nodeId: 'node_1', userIds: ['user_1'] },
    provider
  })

  expect(result.ok).toBe(true)
  expect(result.message).toBe('healthy')
  expect(result.processed).toBe(1)
})

test('provision job asks provider for every requested protocol', async () => {
  const provider = fakeProvider()
  const result = await handleProvisioningJob({
    queue: provisioningQueues.provisionDevice,
    payload: {
      userId: 'user_1',
      deviceId: 'device_1',
      label: 'Laptop',
      protocols: ['vless-reality', 'trojan-tls', 'shadowsocks'],
      trafficLimitGb: 200,
      reason: 'new_device'
    },
    provider
  })

  expect(result.ok).toBe(true)
  expect(result.processed).toBe(3)
})

test('revoke expired job revokes every active device id', async () => {
  const revoked: string[] = []
  const provider = fakeProvider({
    async revoke(input) {
      revoked.push(input.deviceId)
    }
  })

  const result = await handleProvisioningJob({
    queue: provisioningQueues.revokeExpired,
    payload: {
      subscriptionId: 'sub_1',
      userId: 'user_1',
      deviceIds: ['device_1', 'device_2']
    },
    provider
  })

  expect(result.ok).toBe(true)
  expect(result.processed).toBe(2)
  expect(revoked).toEqual(['device_1', 'device_2'])
})

function fakeProvider(overrides: Partial<VpnProviderAdapter> = {}): VpnProviderAdapter {
  return {
    id: 'fake',
    async health() {
      return { ok: true, provider: 'fake', checkedAt: new Date() }
    },
    async provision(input) {
      return input.protocols.map((protocol) => ({
        protocol,
        name: protocol,
        uri: `${protocol}://profile`,
        nodeId: 'node_1'
      }))
    },
    async revoke() {
      return
    },
    async rotate(input) {
      return this.provision(input)
    },
    async syncUsage() {
      return []
    },
    ...overrides
  }
}
