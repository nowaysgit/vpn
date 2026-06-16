import { Bot } from 'gramio'
import { BackendApiClient } from './api'
import { linkHelpMessage, linkedMessage, profileMessage, startMessage } from './messages'

const token = process.env.TELEGRAM_BOT_TOKEN
const publicUrl = process.env.APP_PUBLIC_URL ?? 'http://localhost:3000'
const backendUrl = process.env.API_BASE_URL ?? 'http://localhost:3001'

if (!token) {
  console.log('TELEGRAM_BOT_TOKEN is not set; Telegram bot is idle.')
} else {
  const api = new BackendApiClient(backendUrl)
  const bot = new Bot(token)
    .command('start', (context) => context.send(startMessage(publicUrl)))
    .command('link', async (context) => {
      const linkToken = linkTokenFromText(context.text)
      if (!linkToken) return context.send(linkHelpMessage(publicUrl))
      if (!context.from?.id) return context.send('Telegram user id is not available.')

      const linkInput = {
        token: linkToken,
        telegramUserId: String(context.from.id),
        ...(context.from.username ? { username: context.from.username } : {})
      }
      const linked = await api.linkTelegram(linkInput)

      return context.send(linkedMessage(linked.email))
    })
    .command('cabinet', async (context) => {
      if (!context.from?.id) return context.send('Telegram user id is not available.')

      const profile = await api.getTelegramProfile(String(context.from.id))
      return context.send(profileMessage(profile))
    })
    .onError(({ error }) => {
      console.error('Telegram bot error', error)
    })

  bot.start()
  console.log('vpn telegram bot started')
}

function linkTokenFromText(text: string | undefined): string {
  return (text ?? '').replace(/^\/link(@\w+)?\s*/i, '').trim()
}
