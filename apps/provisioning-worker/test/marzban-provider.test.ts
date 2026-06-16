import { describe, expect, test } from 'bun:test'
import { WorkerMarzbanProvider } from '../src/marzban-provider'

describe('worker Marzban provider', () => {
  test('provisions profiles through Marzban API', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = []
    const provider = new WorkerMarzbanProvider({
      baseUrl: 'https://marzban.example',
      username: 'admin',
      password: 'password',
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} })
        if (String(url).endsWith('/api/admin/token')) return Response.json({ access_token: 'token-1' })
        return Response.json({ links: ['vless://secret@node:443#Laptop'] })
      }
    })

    const profiles = await provider.provision({
      userId: 'user_1',
      deviceId: 'device_1',
      label: 'Laptop',
      protocols: ['vless-reality'],
      trafficLimitGb: 100
    })

    expect(profiles[0]?.protocol).toBe('vless-reality')
    expect(requests.some((request) => request.url.endsWith('/api/user'))).toBe(true)
  })
})
