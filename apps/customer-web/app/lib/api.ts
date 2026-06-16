import type { CustomerDevice, CustomerProfile, PaymentInvoice, PublicPlan, TelegramLinkToken } from '@vpn/api-contract'

export type RegisterResult = {
  userId: string
  verificationToken: string
}

export type LoginResult = {
  token: string
  user: {
    id: string
    email: string
    name: string
    role: string
    emailVerified: boolean
  }
}

export class CustomerApi {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  plans(): Promise<PublicPlan[]> {
    return this.request('/plans')
  }

  register(input: { email: string; name: string; password: string }): Promise<RegisterResult> {
    return this.request('/auth/register', { method: 'POST', body: input })
  }

  verifyEmail(token: string): Promise<{ ok: boolean }> {
    return this.request('/auth/verify-email', { method: 'POST', body: { token } })
  }

  login(input: { email: string; password: string }): Promise<LoginResult> {
    return this.request('/auth/login', { method: 'POST', body: input })
  }

  profile(token: string): Promise<CustomerProfile> {
    return this.request('/me/profile', { token })
  }

  devices(token: string): Promise<CustomerDevice[]> {
    return this.request('/me/devices', { token })
  }

  addDevice(token: string, label: string): Promise<CustomerDevice | { replaceRequired: boolean; devices: CustomerDevice[] }> {
    return this.request('/me/devices', { method: 'POST', token, body: { label }, acceptStatus: [409] })
  }

  replaceDevice(token: string, replaceDeviceId: string, label: string): Promise<CustomerDevice> {
    return this.request('/me/devices/replace', { method: 'POST', token, body: { replaceDeviceId, label } })
  }

  removeDevice(token: string, id: string): Promise<{ ok: boolean }> {
    return this.request(`/me/devices/${id}`, { method: 'DELETE', token })
  }

  telegramLinkToken(token: string): Promise<TelegramLinkToken> {
    return this.request('/telegram/link-token', { method: 'POST', token })
  }

  createPayment(token: string, planId: string): Promise<PaymentInvoice> {
    return this.request('/payments/create', {
      method: 'POST',
      token,
      body: { planId, provider: 'platega', idempotencyKey: `web-${Date.now()}` }
    })
  }

  sandboxMarkPaid(invoiceId: string): Promise<{ ok: boolean }> {
    return this.request('/payments/webhooks/platega', {
      method: 'POST',
      body: { paymentId: invoiceId, eventId: `sandbox-${Date.now()}`, status: 'paid' }
    })
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
    if (!response.ok && !options.acceptStatus?.includes(response.status)) throw new Error(errorMessage(data, response.status))
    return data as T
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  token?: string
  body?: unknown
  acceptStatus?: number[]
}

function errorMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message?: unknown }).message
    if (typeof message === 'string') return message
  }

  return `Request failed with status ${status}`
}
