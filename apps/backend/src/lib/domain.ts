import type { PaymentProvider, PaymentStatus, SubscriptionStatus, UserRole, VpnProtocol } from '@vpn/api-contract'

export const DEVICE_LIMIT = 4
export const GRACE_PERIOD_DAYS = 1
export const MVP_PROTOCOLS: VpnProtocol[] = ['vless-reality', 'trojan-tls', 'shadowsocks']

export type User = {
  id: string
  email: string
  name: string
  passwordHash: string
  emailVerified: boolean
  role: UserRole
  blocked: boolean
  notes: string | null
  subscriptionToken: string
  createdAt: Date
}

export type EmailVerificationToken = {
  token: string
  userId: string
  expiresAt: Date
  resendAvailableAt: Date
  usedAt: Date | null
}

export type Plan = {
  id: string
  code: string
  title: string
  priceRub: number
  durationDays: number
  trafficLimitGb: number
  deviceLimit: number
}

export type Subscription = {
  id: string
  userId: string
  planId: string
  status: SubscriptionStatus
  startsAt: Date
  endsAt: Date
  graceEndsAt: Date
  trafficUsedBytes: bigint
  trafficLimitBytes: bigint
  grantedByAdminId: string | null
}

export type Device = {
  id: string
  userId: string
  label: string
  status: 'active' | 'revoked' | 'pending_replacement'
  createdAt: Date
  lastSeenAt: Date | null
}

export type DeviceCredential = {
  id: string
  userId: string
  deviceId: string
  encryptedPayload: string
  serverId: string
  protocols: VpnProtocol[]
  createdAt: Date
  revokedAt: Date | null
}

export type Payment = {
  id: string
  userId: string
  planId: string
  provider: PaymentProvider
  providerPaymentId: string
  status: PaymentStatus
  amountRub: number
  checkoutUrl: string
  idempotencyKey: string
  createdAt: Date
  paidAt: Date | null
}

export type PaymentEvent = {
  id: string
  paymentId: string
  provider: PaymentProvider
  providerEventId: string
  status: PaymentStatus
  rawPayload: unknown
  createdAt: Date
}

export type VpnNode = {
  id: string
  name: string
  locationCode: string
  provider: 'marzban' | 'manual-external'
  publicHost: string
  enabled: boolean
}

export type AdminAuditLog = {
  id: string
  actorUserId: string
  action: string
  targetType: string
  targetId: string
  createdAt: Date
}

export type SupportTicket = {
  id: string
  userId: string
  subject: string
  message: string
  status: 'open' | 'closed'
  createdAt: Date
}

export type TelegramAccount = {
  telegramUserId: string
  userId: string
  username: string | null
  linkedAt: Date
}

export type TelegramLinkToken = {
  token: string
  userId: string
  expiresAt: Date
  usedAt: Date | null
}
