import type { VpnProviderAdapter } from '@vpn/provider-contract'
import { provisioningQueues, type ProvisionDeviceJob, type ProvisioningJobPayload, type RevokeExpiredJob, type RotateDeviceJob, type SyncMarzbanJob } from './jobs'

export type WorkerResult = {
  ok: boolean
  queue: string
  message: string
  processed: number
}

export async function handleProvisioningJob(input: {
  queue: string
  payload: ProvisioningJobPayload
  provider: VpnProviderAdapter
}): Promise<WorkerResult> {
  if (input.queue === provisioningQueues.provisionDevice) {
    const payload = input.payload as ProvisionDeviceJob
    const profiles = await input.provider.provision(payload)
    return {
      ok: true,
      queue: input.queue,
      message: `Provisioned ${profiles.length} VPN profiles`,
      processed: profiles.length
    }
  }

  if (input.queue === provisioningQueues.rotateDevice) {
    const payload = input.payload as RotateDeviceJob
    const profiles = await input.provider.rotate(payload)
    return {
      ok: true,
      queue: input.queue,
      message: `Rotated ${profiles.length} VPN profiles`,
      processed: profiles.length
    }
  }

  if (input.queue === provisioningQueues.revokeExpired) {
    const payload = input.payload as RevokeExpiredJob
    for (const deviceId of payload.deviceIds) {
      await input.provider.revoke({
        userId: payload.userId,
        deviceId
      })
    }

    return {
      ok: true,
      queue: input.queue,
      message: `Revoked ${payload.deviceIds.length} expired devices`,
      processed: payload.deviceIds.length
    }
  }

  if (input.queue === provisioningQueues.syncMarzban) {
    const payload = input.payload as SyncMarzbanJob
    const health = await input.provider.health()
    if (!health.ok) {
      return {
        ok: false,
        queue: input.queue,
        message: health.message ?? `Provider ${health.provider} is unhealthy`,
        processed: 0
      }
    }
    const snapshots = (
      await Promise.all(payload.userIds.map((userId) => input.provider.syncUsage(userId)))
    ).flat()

    return {
      ok: health.ok,
      queue: input.queue,
      message: health.message ?? `Synced ${snapshots.length} usage snapshots`,
      processed: snapshots.length
    }
  }

  if (input.queue === provisioningQueues.assignExternalFallback) {
    return {
      ok: true,
      queue: input.queue,
      message: 'External fallback assignment accepted',
      processed: 1
    }
  }

  return {
    ok: true,
    queue: input.queue,
    message: 'Job accepted',
    processed: 0
  }
}
