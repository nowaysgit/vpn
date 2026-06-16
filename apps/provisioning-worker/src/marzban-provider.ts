import type {
  VpnCredentialInput,
  VpnProviderAdapter,
  VpnProviderHealth,
  VpnRenderedProfile,
  VpnRevokeInput,
  VpnUsageSnapshot
} from '@vpn/provider-contract'
import type { VpnProtocol } from '@vpn/api-contract'

type Fetch = (url: URL | RequestInfo, init?: RequestInit) => Promise<Response>

export class WorkerMarzbanProvider implements VpnProviderAdapter {
  readonly id = 'marzban'
  private readonly baseUrl: string
  private readonly username: string
  private readonly password: string
  private readonly fetchImpl: Fetch

  constructor(input: { baseUrl: string; username: string; password: string; fetchImpl?: Fetch }) {
    this.baseUrl = input.baseUrl
    this.username = input.username
    this.password = input.password
    this.fetchImpl = input.fetchImpl ?? fetch
  }

  async health(): Promise<VpnProviderHealth> {
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
    const response = await this.request('/api/user', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(userPayload(input))
    })

    return profilesFromResponse((await response.json()) as Record<string, unknown>, input)
  }

  async revoke(input: VpnRevokeInput): Promise<void> {
    await this.request(`/api/user/${encodeURIComponent(providerUsername(input))}`, { method: 'DELETE' })
  }

  async rotate(input: VpnCredentialInput): Promise<VpnRenderedProfile[]> {
    const response = await this.request(`/api/user/${encodeURIComponent(providerUsername(input))}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(userPayload(input))
    })

    return profilesFromResponse((await response.json()) as Record<string, unknown>, input)
  }

  async syncUsage(userId: string): Promise<VpnUsageSnapshot[]> {
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

      if (!deviceId || typeof usedTraffic !== 'number') return []

      return [
        {
          userId,
          deviceId,
          trafficUsedBytes: BigInt(Math.max(0, Math.trunc(usedTraffic))),
          activeConnections: record.online_at ? 1 : 0,
          sampledAt
        }
      ]
    })
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const token = await this.token()
    const response = await this.fetchImpl(new URL(path, normalizedBaseUrl(this.baseUrl)), {
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
    const body = new URLSearchParams()
    body.set('username', this.username)
    body.set('password', this.password)

    const response = await this.fetchImpl(new URL('/api/admin/token', normalizedBaseUrl(this.baseUrl)), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    })

    if (!response.ok) throw new Error(`Marzban token request failed with ${response.status}`)
    const payload = (await response.json()) as Record<string, unknown>
    const accessToken = payload.access_token
    if (typeof accessToken !== 'string' || !accessToken) throw new Error('Marzban token response is missing access_token')

    return accessToken
  }
}

function userPayload(input: VpnCredentialInput) {
  return {
    username: providerUsername(input),
    status: 'active',
    data_limit: Math.max(0, Math.trunc(input.trafficLimitGb * 1024 ** 3)),
    data_limit_reset_strategy: 'no_reset',
    proxies: proxies(input.protocols)
  }
}

function profilesFromResponse(response: Record<string, unknown>, input: VpnCredentialInput): VpnRenderedProfile[] {
  const links = Array.isArray(response.links) ? response.links.filter((link): link is string => typeof link === 'string') : []

  return links.flatMap((uri) => {
    const protocol = protocolFromUri(uri)
    if (!protocol) return []

    return [
      {
        protocol,
        name: `${input.label} ${protocol}`,
        uri,
        nodeId: 'marzban'
      }
    ]
  })
}

function providerUsername(input: { userId: string; deviceId: string }): string {
  return `u_${input.userId}__${input.deviceId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
}

function proxies(protocols: VpnProtocol[]) {
  const value: Record<string, Record<string, never>> = {}
  if (protocols.includes('vless-reality')) value.vless = {}
  if (protocols.includes('trojan-tls')) value.trojan = {}
  if (protocols.includes('shadowsocks')) value.shadowsocks = {}
  return value
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
