import type { CustomerDevice, CustomerProfile } from '@vpn/api-contract'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../../db'
import { credentialServerHistory, deviceCredentials, devices, plans, vpnNodes } from '../../db/schema'
import { DEVICE_LIMIT, MVP_PROTOCOLS, type Device, type Subscription, type User } from '../../lib/domain'
import { notFound } from '../../lib/errors'
import { createId } from '../../lib/id'
import { ManualExternalProviderAdapter, MarzbanProviderAdapter } from '../../lib/providers'
import { encryptJson } from '../../lib/security'
import { bytesToGb, now, toIso } from '../../lib/time'
import { requireEntity } from '../../services/entity.service'
import {
  currentSubscription,
  requireUsableSubscription,
  subscriptionDeviceLimit
} from '../subscriptions/subscriptions.service'

type ProvisionedCredential = {
  encryptedPayload: string
  protocols: CustomerDevice['protocols']
  serverId: string
}

export async function customerProfile(user: User): Promise<CustomerProfile> {
  const subscription = await currentSubscription(user.id)
  const plan = subscription
    ? (
        await db
          .select()
          .from(plans)
          .where(eq(plans.id, subscription.planId))
          .limit(1)
      )[0]
    : null

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    subscriptionStatus: subscription?.status ?? 'expired',
    subscriptionEndsAt: toIso(subscription?.endsAt ?? null),
    trafficUsedGb: subscription ? bytesToGb(subscription.trafficUsedBytes) : 0,
    trafficLimitGb: plan?.trafficLimitGb ?? 0,
    deviceLimit: plan?.deviceLimit ?? DEVICE_LIMIT,
    subscriptionUrl: `/sub/${user.subscriptionToken}`
  }
}

export async function customerDevice(device: Device): Promise<CustomerDevice> {
  const [row] = await db
    .select({
      credential: deviceCredentials,
      node: vpnNodes
    })
    .from(deviceCredentials)
    .leftJoin(vpnNodes, eq(vpnNodes.id, deviceCredentials.serverId))
    .where(and(eq(deviceCredentials.deviceId, device.id), isNull(deviceCredentials.revokedAt)))
    .orderBy(desc(deviceCredentials.createdAt))
    .limit(1)

  return {
    id: device.id,
    label: device.label,
    status: device.status,
    createdAt: device.createdAt.toISOString(),
    lastSeenAt: toIso(device.lastSeenAt),
    serverName: row?.node?.name ?? null,
    protocols: row?.credential.protocols ?? []
  }
}

export async function activeDevices(userId: string): Promise<Device[]> {
  return db
    .select()
    .from(devices)
    .where(and(eq(devices.userId, userId), eq(devices.status, 'active')))
    .orderBy(desc(devices.createdAt))
}

export async function listCustomerDevices(user: User): Promise<CustomerDevice[]> {
  return Promise.all((await activeDevices(user.id)).map((device) => customerDevice(device)))
}

export async function addCustomerDevice(
  user: User,
  label: string
): Promise<
  | { status: 200; body: CustomerDevice }
  | { status: 409; body: { code: 'DEVICE_LIMIT_REACHED'; message: string; replaceRequired: true; devices: CustomerDevice[] } }
> {
  const subscription = await requireUsableSubscription(user.id)
  const deviceLimit = await subscriptionDeviceLimit(subscription)
  const userDevices = await activeDevices(user.id)

  if (userDevices.length >= deviceLimit) {
    return {
      status: 409,
      body: {
        code: 'DEVICE_LIMIT_REACHED',
        message: 'Device limit reached. Choose a device to replace.',
        replaceRequired: true,
        devices: await Promise.all(userDevices.map((device) => customerDevice(device)))
      }
    }
  }

  const device = await createDeviceWithCredentials(user, label, subscription)
  return { status: 200, body: device }
}

export async function replaceCustomerDevice(user: User, replaceDeviceId: string, label: string): Promise<CustomerDevice> {
  const subscription = await requireUsableSubscription(user.id)
  const replaced = requireEntity(
    (
      await db
        .select()
        .from(devices)
        .where(and(eq(devices.id, replaceDeviceId), eq(devices.userId, user.id)))
        .limit(1)
    )[0],
    'Device to replace was not found'
  )

  await revokeDeviceAccess(user, replaced, true)

  return createDeviceWithCredentials(user, label, subscription)
}

export async function deleteCustomerDevice(user: User, deviceId: string): Promise<void> {
  const device = requireEntity(
    (
      await db
        .select()
        .from(devices)
        .where(and(eq(devices.id, deviceId), eq(devices.userId, user.id)))
        .limit(1)
    )[0],
    'Device not found'
  )
  await revokeDeviceAccess(user, device, true)
}

export async function rotateCustomerDevice(user: User, deviceId: string): Promise<CustomerDevice> {
  const subscription = await requireUsableSubscription(user.id)
  const device = requireEntity(
    (
      await db
        .select()
        .from(devices)
        .where(and(eq(devices.id, deviceId), eq(devices.userId, user.id), eq(devices.status, 'active')))
        .limit(1)
    )[0],
    'Device not found'
  )
  await revokeDeviceAccess(user, device, false)
  const credential = await provisionDevice(user, device, subscription)
  await insertCredential(user, device, credential)

  return customerDevice(device)
}

export async function revokeUserDevices(user: User): Promise<void> {
  for (const device of await activeDevices(user.id)) {
    await revokeDeviceAccess(user, device, true)
  }
}

async function createDeviceWithCredentials(user: User, label: string, subscription: Subscription): Promise<CustomerDevice> {
  const device: Device = {
    id: createId('dev'),
    userId: user.id,
    label,
    status: 'active',
    createdAt: now(),
    lastSeenAt: null
  }
  const credential = await provisionDevice(user, device, subscription)
  const credentialId = createId('cred')

  await db.transaction(async (tx) => {
    await tx.insert(devices).values(device)
    await tx.insert(deviceCredentials).values({
      id: credentialId,
      userId: user.id,
      deviceId: device.id,
      encryptedPayload: credential.encryptedPayload,
      serverId: credential.serverId,
      protocols: credential.protocols,
      createdAt: now(),
      revokedAt: null
    })
    await tx.insert(credentialServerHistory).values({
      id: createId('csh'),
      credentialId,
      serverId: credential.serverId,
      assignedAt: now()
    })
  })

  return customerDevice(device)
}

async function revokeDeviceAccess(user: User, device: Device, revokeDevice: boolean): Promise<void> {
  const activeCredentials = await db
    .select({
      credential: deviceCredentials,
      node: vpnNodes
    })
    .from(deviceCredentials)
    .leftJoin(vpnNodes, eq(vpnNodes.id, deviceCredentials.serverId))
    .where(and(eq(deviceCredentials.deviceId, device.id), isNull(deviceCredentials.revokedAt)))

  for (const { node } of activeCredentials) {
    if (!node) continue

    if (node.provider === 'marzban') {
      const provider = new MarzbanProviderAdapter({ nodeId: node.id, host: node.publicHost })
      await provider.revoke({ userId: user.id, deviceId: device.id })
    } else {
      const provider = new ManualExternalProviderAdapter()
      await provider.revoke({ userId: user.id, deviceId: device.id })
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(deviceCredentials)
      .set({ revokedAt: now() })
      .where(and(eq(deviceCredentials.deviceId, device.id), isNull(deviceCredentials.revokedAt)))

    if (revokeDevice) {
      await tx
        .update(devices)
        .set({ status: 'revoked' })
        .where(eq(devices.id, device.id))
    }
  })
}

async function provisionDevice(user: User, device: Device, subscription: Subscription): Promise<ProvisionedCredential> {
  const input = {
    userId: user.id,
    deviceId: device.id,
    label: device.label,
    protocols: MVP_PROTOCOLS,
    trafficLimitGb: bytesToGb(subscription.trafficLimitBytes)
  }

  const [primaryNode] = await db
    .select()
    .from(vpnNodes)
    .where(and(eq(vpnNodes.enabled, true), eq(vpnNodes.provider, 'marzban')))
    .limit(1)
  const [fallbackNode] = await db
    .select()
    .from(vpnNodes)
    .where(and(eq(vpnNodes.enabled, true), eq(vpnNodes.provider, 'manual-external')))
    .limit(1)
  const provisioned = primaryNode ? await tryProvisionOnMarzban(primaryNode, input) : null
  const resolved = provisioned ?? (fallbackNode ? await provisionOnManualFallback(fallbackNode, input) : null)

  if (!resolved) throw notFound('VPN node not found')
  const { node, profiles } = resolved
  const protocols = profiles.map((profile) => profile.protocol)

  return {
    encryptedPayload: encryptJson(profiles),
    protocols,
    serverId: node.id
  }
}

type ProvisionInput = {
  userId: string
  deviceId: string
  label: string
  protocols: typeof MVP_PROTOCOLS
  trafficLimitGb: number
}

async function tryProvisionOnMarzban(node: { id: string; publicHost: string }, input: ProvisionInput) {
  try {
    if (process.env.MARZBAN_FORCE_DOWN === 'true') throw new Error('Marzban is forced down')
    const provider = new MarzbanProviderAdapter({ nodeId: node.id, host: node.publicHost })
    const profiles = await provider.provision(input)
    return profiles.length > 0 ? { node, profiles } : null
  } catch {
    return null
  }
}

async function provisionOnManualFallback(node: { id: string; publicHost: string }, input: ProvisionInput) {
  const provider = new ManualExternalProviderAdapter()
  const profiles = await provider.provision(input)
  return profiles.length > 0 ? { node, profiles } : null
}

async function insertCredential(user: User, device: Device, credential: ProvisionedCredential): Promise<void> {
  const credentialId = createId('cred')
  await db.transaction(async (tx) => {
    await tx.insert(deviceCredentials).values({
      id: credentialId,
      userId: user.id,
      deviceId: device.id,
      encryptedPayload: credential.encryptedPayload,
      serverId: credential.serverId,
      protocols: credential.protocols,
      createdAt: now(),
      revokedAt: null
    })
    await tx.insert(credentialServerHistory).values({
      id: createId('csh'),
      credentialId,
      serverId: credential.serverId,
      assignedAt: now()
    })
  })
}
