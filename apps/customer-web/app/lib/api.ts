import type { CustomerDevice, CustomerProfile, PaymentInvoice, PublicPlan, TelegramLinkToken } from '@vpn/api-contract'

export type RegisterResult = {
  userId: string
  email: string
  verificationEmailSent: boolean
  resendAvailableAt: string
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

  resendRegistration(email: string): Promise<Omit<RegisterResult, 'userId'>> {
    return this.request('/auth/register/resend', { method: 'POST', body: { email } })
  }

  verifyEmail(email: string, code: string): Promise<{ ok: boolean }> {
    return this.request('/auth/verify-email', { method: 'POST', body: { email, code } })
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
      body: { planId, idempotencyKey: `web-${Date.now()}` }
    })
  }

  async sandboxMarkPaid(invoice: PaymentInvoice): Promise<{ ok: boolean }> {
    if (invoice.provider === 'tbank') {
      const result = await this.request('/payments/webhooks/tbank', {
        method: 'POST',
        body: {
          PaymentId: invoice.id,
          Status: 'CONFIRMED',
          Success: true,
          Amount: invoice.amountRub * 100
        }
      })
      return { ok: result === 'OK' }
    }

    return this.request('/payments/webhooks/platega', {
      method: 'POST',
      body: { paymentId: invoice.id, eventId: `sandbox-${Date.now()}`, status: 'paid' }
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
    const data = text ? parseResponseBody(text) : null
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

function parseResponseBody(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}
