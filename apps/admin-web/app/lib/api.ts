import type { AdminAuditEntry, AdminUserListItem, PublicPlan } from '@vpn/api-contract'

export type LoginResult = {
  token: string
  user: {
    id: string
    email: string
    role: string
  }
}

export type ServerRow = {
  id: string
  name: string
  locationCode: string
  provider: string
  publicHost: string
  enabled: boolean
  protocols: string[]
  visibleToCustomer: boolean
}

export class AdminApi {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  login(email: string, password: string): Promise<LoginResult> {
    return this.request('/auth/login', { method: 'POST', body: { email, password } })
  }

  plans(): Promise<PublicPlan[]> {
    return this.request('/plans')
  }

  users(token: string): Promise<AdminUserListItem[]> {
    return this.request('/admin/users', { token })
  }

  grant(token: string, userId: string, planId: string): Promise<unknown> {
    return this.request(`/admin/users/${userId}/grant`, { method: 'POST', token, body: { planId } })
  }

  block(token: string, userId: string): Promise<AdminUserListItem> {
    return this.request(`/admin/users/${userId}/block`, { method: 'POST', token })
  }

  notes(token: string, userId: string, notes: string): Promise<AdminUserListItem> {
    return this.request(`/admin/users/${userId}/notes`, { method: 'POST', token, body: { notes } })
  }

  audit(token: string): Promise<AdminAuditEntry[]> {
    return this.request('/admin/audit', { token })
  }

  servers(token: string): Promise<ServerRow[]> {
    return this.request('/admin/servers', { token })
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    })
    const text = await response.text()
    const data = text ? JSON.parse(text) as unknown : null
    if (!response.ok) throw new Error(errorMessage(data, response.status))
    return data as T
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST'
  token?: string
  body?: unknown
}

function errorMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message?: unknown }).message
    if (typeof message === 'string') return message
  }

  return `Request failed with status ${status}`
}
