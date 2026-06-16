import type { VpnProtocol } from '@vpn/api-contract'

export type VpnCredentialInput = {
  userId: string
  deviceId: string
  label: string
  protocols: VpnProtocol[]
  trafficLimitGb: number
}

export type VpnRevokeInput = {
  userId: string
  deviceId: string
}

export type VpnRenderedProfile = {
  protocol: VpnProtocol
  name: string
  uri: string
  nodeId: string
}

export type VpnProviderHealth = {
  ok: boolean
  provider: string
  checkedAt: Date
  message?: string
}

export type VpnUsageSnapshot = {
  userId: string
  deviceId: string
  trafficUsedBytes: bigint
  activeConnections: number
  sampledAt: Date
}

export interface VpnProviderAdapter {
  readonly id: string
  health(): Promise<VpnProviderHealth>
  provision(input: VpnCredentialInput): Promise<VpnRenderedProfile[]>
  revoke(input: VpnRevokeInput): Promise<void>
  rotate(input: VpnCredentialInput): Promise<VpnRenderedProfile[]>
  syncUsage(userId: string): Promise<VpnUsageSnapshot[]>
}
