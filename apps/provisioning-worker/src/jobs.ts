import type { VpnProtocol } from '@vpn/api-contract'

export const provisioningQueues = {
  provisionDevice: 'vpn.provision-device',
  rotateDevice: 'vpn.rotate-device',
  revokeExpired: 'vpn.revoke-expired',
  syncMarzban: 'vpn.sync-marzban',
  assignExternalFallback: 'vpn.assign-external-fallback'
} as const

export type ProvisionDeviceJob = {
  userId: string
  deviceId: string
  label: string
  protocols: VpnProtocol[]
  trafficLimitGb: number
  reason: 'new_device' | 'manual_retry'
}

export type RotateDeviceJob = {
  userId: string
  deviceId: string
  label: string
  protocols: VpnProtocol[]
  trafficLimitGb: number
  reason: 'user_requested' | 'admin_requested' | 'provider_recovery'
}

export type RevokeExpiredJob = {
  subscriptionId: string
  userId: string
  deviceIds: string[]
}

export type SyncMarzbanJob = {
  nodeId: string
  userIds: string[]
}

export type AssignExternalFallbackJob = {
  userId: string
  encryptedExternalSubscription: string
  incidentId: string
}

export type ProvisioningJobPayload =
  | ProvisionDeviceJob
  | RotateDeviceJob
  | RevokeExpiredJob
  | SyncMarzbanJob
  | AssignExternalFallbackJob
