export type UserRole = 'owner' | 'admin' | 'support' | 'customer'

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'traffic_over_limit'
  | 'grace'
  | 'expired'
  | 'blocked'

export type VpnProtocol = 'vless-reality' | 'trojan-tls' | 'shadowsocks' | 'external-manual'

export type PaymentProvider = 'tbank' | 'platega' | 'manual'

export type PaymentStatus =
  | 'created'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded'

export type DeviceStatus = 'active' | 'revoked' | 'pending_replacement'

export type PublicPlan = {
  id: string
  code: string
  title: string
  priceRub: number
  durationDays: number
  trafficLimitGb: number
  deviceLimit: number
}

export type CustomerProfile = {
  id: string
  email: string
  name: string
  emailVerified: boolean
  subscriptionStatus: SubscriptionStatus
  subscriptionEndsAt: string | null
  trafficUsedGb: number
  trafficLimitGb: number
  deviceLimit: number
  subscriptionUrl: string
}

export type CustomerDevice = {
  id: string
  label: string
  status: DeviceStatus
  createdAt: string
  lastSeenAt: string | null
  serverName: string | null
  protocols: VpnProtocol[]
}

export type PaymentInvoice = {
  id: string
  provider: PaymentProvider
  status: PaymentStatus
  amountRub: number
  checkoutUrl: string
}

export type AdminUserListItem = {
  id: string
  email: string
  name: string
  role: UserRole
  subscriptionStatus: SubscriptionStatus
  subscriptionEndsAt: string | null
  trafficUsedGb: number
  trafficLimitGb: number
  deviceCount: number
  notes: string | null
}

export type AdminAuditEntry = {
  id: string
  actorEmail: string
  action: string
  targetType: string
  targetId: string
  createdAt: string
}

export type TelegramLinkToken = {
  token: string
  expiresAt: string
}

export type TelegramCabinetProfile = CustomerProfile & {
  telegramUserId: string
}

export type ApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'EMAIL_NOT_VERIFIED'
  | 'NOT_FOUND'
  | 'DEVICE_LIMIT_REACHED'
  | 'PAYMENT_PROVIDER_ERROR'
  | 'TRAFFIC_LIMIT_REACHED'
  | 'VALIDATION_ERROR'

export type ApiErrorBody = {
  code: ApiErrorCode
  message: string
}
