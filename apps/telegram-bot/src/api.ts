import type { TelegramCabinetProfile } from '@vpn/api-contract'

export class BackendApiClient {
  private readonly baseUrl: string
  private readonly botSecret: string | undefined

  constructor(baseUrl: string, botSecret = process.env.TELEGRAM_BOT_SECRET) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.botSecret = botSecret
  }

  async linkTelegram(input: { token: string; telegramUserId: string; username?: string }): Promise<{ ok: true; email: string }> {
    const response = await fetch(`${this.baseUrl}/telegram/link`, {
      method: 'POST',
      headers: this.botHeaders(),
      body: JSON.stringify(input)
    })

    if (!response.ok) throw new Error(`Backend Telegram link request failed: ${response.status}`)
    return (await response.json()) as { ok: true; email: string }
  }

  async getTelegramProfile(telegramUserId: string): Promise<TelegramCabinetProfile> {
    const response = await fetch(`${this.baseUrl}/telegram/profile/${encodeURIComponent(telegramUserId)}`, {
      headers: this.botHeaders()
    })

    if (!response.ok) throw new Error(`Backend profile request failed: ${response.status}`)
    return (await response.json()) as TelegramCabinetProfile
  }

  private botHeaders(): HeadersInit {
    return {
      'content-type': 'application/json',
      ...(this.botSecret ? { 'x-telegram-bot-secret': this.botSecret } : {})
    }
  }
}
