import type {
  VpnProviderAdapter,
  VpnProviderHealth,
  VpnRenderedProfile,
  VpnRevokeInput,
  VpnUsageSnapshot
} from '@vpn/provider-contract'
import type { VpnCredentialInput } from '@vpn/provider-contract'
import type { VpnProtocol } from '@vpn/api-contract'

type Fetch = (url: URL | RequestInfo, init?: RequestInit) => Promise<Response>

type MarzbanAdapterOptions = {
  nodeId: string
  host: string
  baseUrl?: string
  username?: string
  password?: string
  fetchImpl?: Fetch
}

type MarzbanUserResponse = {
  username?: string
  links?: string[]
  subscription_url?: string
}

export class MarzbanProviderAdapter implements VpnProviderAdapter {
  readonly id = 'marzban'
  private readonly nodeId: string
  private readonly host: string
  private readonly baseUrl: string | undefined
  private readonly username: string | undefined
  private readonly password: string | undefined
  private readonly fetchImpl: Fetch

  constructor(input: MarzbanAdapterOptions) {
    this.nodeId = input.nodeId
    this.host = input.host
    this.baseUrl = input.baseUrl ?? testlessEnv('MARZBAN_BASE_URL')
    this.username = input.username ?? testlessEnv('MARZBAN_USERNAME')
    this.password = input.password ?? testlessEnv('MARZBAN_PASSWORD')
    this.fetchImpl = input.fetchImpl ?? fetch
  }

  async health(): Promise<VpnProviderHealth> {
    if (!this.baseUrl) return this.sandboxHealth()

    try {
      await this.request('/api/system', { method: 'GET' })
      return {
        ok: true,
        provider: this.id,
        checkedAt: new Date()
      }
    } catch (error) {
      return {
        ok: false,
        provider: this.id,
        checkedAt: new Date(),
        message: error instanceof Error ? error.message : 'Marzban health check failed'
      }
    }
  }

  async provision(input: VpnCredentialInput): Promise<VpnRenderedProfile[]> {
    if (!this.baseUrl) return this.sandboxProfiles(input)

    const response = await this.request('/api/user', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(this.userPayload(input))
    })
    const body = (await response.json()) as MarzbanUserResponse
    return this.renderRemoteProfiles(body, input)
  }

  async revoke(input: VpnRevokeInput): Promise<void> {
    if (!this.baseUrl) return
    await this.request(`/api/user/${encodeURIComponent(providerUsername(input))}`, {
      method: 'DELETE'
    })
  }

  async rotate(input: VpnCredentialInput): Promise<VpnRenderedProfile[]> {
    if (!this.baseUrl) return this.sandboxProfiles(input)

    const response = await this.request(`/api/user/${encodeURIComponent(providerUsername(input))}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(this.userPayload(input))
    })
    const body = (await response.json()) as MarzbanUserResponse
    return this.renderRemoteProfiles(body, input)
  }

  async syncUsage(userId: string): Promise<VpnUsageSnapshot[]> {
    if (!this.baseUrl) return []

    const response = await this.request(`/api/users?search=${encodeURIComponent(userId)}`, { method: 'GET' })
    const body = (await response.json()) as Record<string, unknown>
    const users = Array.isArray(body.users) ? body.users : []
    const sampledAt = new Date()

    return users.flatMap((item): VpnUsageSnapshot[] => {
      if (!item || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      const username = typeof record.username === 'string' ? record.username : ''
      const deviceId = username.split('__').at(1)
      const usedTraffic = record.used_traffic
      const activeConnections = record.online_at ? 1 : 0

      if (!deviceId || typeof usedTraffic !== 'number') return []

      return [
        {
          userId,
          deviceId,
          trafficUsedBytes: BigInt(Math.max(0, Math.trunc(usedTraffic))),
          activeConnections,
          sampledAt
        }
      ]
    })
  }

  private sandboxHealth(): VpnProviderHealth {
    return {
      ok: true,
      provider: this.id,
      checkedAt: new Date(),
      message: 'Marzban API base URL is not configured; using local sandbox profiles.'
    }
  }

  private sandboxProfiles(input: VpnCredentialInput): VpnRenderedProfile[] {
    return input.protocols.map((protocol) => this.renderProfile(protocol, input))
  }

  private renderProfile(protocol: VpnProtocol, input: VpnCredentialInput): VpnRenderedProfile {
    const name = `${input.label} ${protocol}`
    const secret = `${input.userId}-${input.deviceId}`

    if (protocol === 'trojan-tls') {
      return {
        protocol,
        name,
        uri: `trojan://${secret}@${this.host}:443?security=tls#${encodeURIComponent(name)}`,
        nodeId: this.nodeId
      }
    }

    if (protocol === 'shadowsocks') {
      const encoded = Buffer.from(`2022-blake3-aes-128-gcm:${secret}@${this.host}:8388`).toString('base64url')
      return {
        protocol,
        name,
        uri: `ss://${encoded}#${encodeURIComponent(name)}`,
        nodeId: this.nodeId
      }
    }

    return {
      protocol,
      name,
      uri: `vless://${secret}@${this.host}:443?encryption=none&security=reality&type=tcp&flow=xtls-rprx-vision#${encodeURIComponent(name)}`,
      nodeId: this.nodeId
    }
  }

  private renderRemoteProfiles(response: MarzbanUserResponse, input: VpnCredentialInput): VpnRenderedProfile[] {
    const links = response.links ?? []
    const rendered = links.flatMap((uri) => {
      const protocol = protocolFromUri(uri)
      if (!protocol) return []

      return [
        {
          protocol,
          name: `${input.label} ${protocol}`,
          uri,
          nodeId: this.nodeId
        }
      ]
    })

    if (rendered.length > 0) return rendered
    if (response.subscription_url) {
      return [
        {
          protocol: 'vless-reality',
          name: `${input.label} subscription`,
          uri: response.subscription_url,
          nodeId: this.nodeId
        }
      ]
    }

    throw new Error('Marzban response did not include subscription links')
  }

  private userPayload(input: VpnCredentialInput) {
    return {
      username: providerUsername(input),
      status: 'active',
      data_limit: Math.max(0, Math.trunc(input.trafficLimitGb * 1024 ** 3)),
      data_limit_reset_strategy: 'no_reset',
      proxies: marzbanProxies(input.protocols)
    }
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const token = await this.token()
    const response = await this.fetchImpl(new URL(path, normalizedBaseUrl(this.requiredBaseUrl())), {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) throw new Error(`Marzban request ${path} failed with ${response.status}`)
    return response
  }

  private async token(): Promise<string> {
    if (!this.username || !this.password) throw new Error('MARZBAN_USERNAME and MARZBAN_PASSWORD are required')

    const body = new URLSearchParams()
    body.set('username', this.username)
    body.set('password', this.password)

    const response = await this.fetchImpl(new URL('/api/admin/token', normalizedBaseUrl(this.requiredBaseUrl())), {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body
    })

    if (!response.ok) throw new Error(`Marzban token request failed with ${response.status}`)
    const payload = (await response.json()) as Record<string, unknown>
    const accessToken = payload.access_token
    if (typeof accessToken !== 'string' || !accessToken) throw new Error('Marzban token response is missing access_token')

    return accessToken
  }

  private requiredBaseUrl(): string {
    if (!this.baseUrl) throw new Error('MARZBAN_BASE_URL is required')
    return this.baseUrl
  }
}

function providerUsername(input: { userId: string; deviceId: string }): string {
  return `u_${safeSegment(input.userId)}__${safeSegment(input.deviceId)}`.slice(0, 64)
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function marzbanProxies(protocols: VpnProtocol[]) {
  const proxies: Record<string, Record<string, never>> = {}

  if (protocols.includes('vless-reality')) proxies.vless = {}
  if (protocols.includes('trojan-tls')) proxies.trojan = {}
  if (protocols.includes('shadowsocks')) proxies.shadowsocks = {}

  return proxies
}

function protocolFromUri(uri: string): VpnProtocol | null {
  if (uri.startsWith('vless://')) return 'vless-reality'
  if (uri.startsWith('trojan://')) return 'trojan-tls'
  if (uri.startsWith('ss://')) return 'shadowsocks'
  return null
}

function normalizedBaseUrl(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function testlessEnv(key: string): string | undefined {
  return process.env.NODE_ENV === 'test' ? undefined : process.env[key]
}

export class ManualExternalProviderAdapter implements VpnProviderAdapter {
  readonly id = 'manual-external'

  async health(): Promise<VpnProviderHealth> {
    return {
      ok: true,
      provider: this.id,
      checkedAt: new Date(),
      message: 'Manual external fallback is assigned by admins in MVP.'
    }
  }

  async provision(input: VpnCredentialInput): Promise<VpnRenderedProfile[]> {
    return [
      {
        protocol: 'external-manual',
        name: `${input.label} external fallback`,
        uri: fallbackUri(input),
        nodeId: 'node_external_fallback'
      }
    ]
  }

  async revoke(_input: VpnRevokeInput): Promise<void> {
    return
  }

  async rotate(input: VpnCredentialInput): Promise<VpnRenderedProfile[]> {
    return this.provision(input)
  }

  async syncUsage(_userId: string): Promise<VpnUsageSnapshot[]> {
    return []
  }
}

function fallbackUri(input: VpnCredentialInput): string {
  const template = process.env.EXTERNAL_FALLBACK_URI_TEMPLATE
  if (template) {
    return template
      .replaceAll('{userId}', encodeURIComponent(input.userId))
      .replaceAll('{deviceId}', encodeURIComponent(input.deviceId))
      .replaceAll('{label}', encodeURIComponent(input.label))
  }

  return `https://fallback.vpn.local/sub/${encodeURIComponent(input.userId)}/${encodeURIComponent(input.deviceId)}`
}
