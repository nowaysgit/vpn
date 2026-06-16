import { describe, expect, test } from 'bun:test'
import { MarzbanProviderAdapter } from '../src/lib/providers'

describe('Marzban provider adapter', () => {
  test('creates a Marzban user and maps returned links to VPN profiles', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = []
    const fetchImpl = async (url: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      requests.push({ url: String(url), init: init ?? {} })

      if (String(url).endsWith('/api/admin/token')) {
        return Response.json({ access_token: 'token-1' })
      }

      if (String(url).endsWith('/api/user')) {
        return Response.json({
          username: 'u_usr_1__dev_1',
          links: [
            'vless://secret@node.example:443#Laptop',
            'trojan://secret@node.example:443#Laptop',
            'ss://secret@node.example:8388#Laptop'
          ]
        })
      }

      return new Response('not found', { status: 404 })
    }

    const adapter = new MarzbanProviderAdapter({
      nodeId: 'node_1',
      host: 'node.example',
      baseUrl: 'https://marzban.example',
      username: 'admin',
      password: 'password',
      fetchImpl
    })
    const profiles = await adapter.provision({
      userId: 'usr_1',
      deviceId: 'dev_1',
      label: 'Laptop',
      protocols: ['vless-reality', 'trojan-tls', 'shadowsocks'],
      trafficLimitGb: 200
    })
    const userRequest = requests.find((request) => request.url.endsWith('/api/user'))

    expect(profiles.map((profile) => profile.protocol)).toEqual(['vless-reality', 'trojan-tls', 'shadowsocks'])
    expect(userRequest?.init.method).toBe('POST')
    expect((userRequest?.init.headers as Record<string, string>).authorization).toBe('Bearer token-1')
    expect(JSON.parse(String(userRequest?.init.body)).data_limit).toBe(200 * 1024 ** 3)
  })

  test('revokes a Marzban user by user and device id', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = []
    const fetchImpl = async (url: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      requests.push({ url: String(url), init: init ?? {} })

      if (String(url).endsWith('/api/admin/token')) return Response.json({ access_token: 'token-1' })
      return Response.json({ ok: true })
    }
    const adapter = new MarzbanProviderAdapter({
      nodeId: 'node_1',
      host: 'node.example',
      baseUrl: 'https://marzban.example',
      username: 'admin',
      password: 'password',
      fetchImpl
    })

    await adapter.revoke({ userId: 'usr_1', deviceId: 'dev_1' })

    const revokeRequest = requests.find((request) => request.url.includes('/api/user/'))
    expect(revokeRequest?.init.method).toBe('DELETE')
    expect(revokeRequest?.url).toContain('u_usr_1__dev_1')
  })
})
