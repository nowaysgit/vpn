import { Elysia, t } from 'elysia'
import type { TelegramCabinetProfile, TelegramLinkToken } from '@vpn/api-contract'
import { requireTelegramBot, requireUser } from '../../services/access-control.service'
import { createTelegramLinkToken, getTelegramProfile, linkTelegramAccount } from './telegram.service'

export function createTelegramRoutes() {
  return new Elysia()
    .post('/telegram/link-token', async ({ headers }): Promise<TelegramLinkToken> => {
      const user = await requireUser(headers.authorization)
      return createTelegramLinkToken(user)
    })
    .post(
      '/telegram/link',
      async ({ headers, body }) => {
        requireTelegramBot(headers)
        return linkTelegramAccount(body)
      },
      {
        body: t.Object({
          token: t.String(),
          telegramUserId: t.String(),
          username: t.Optional(t.String())
        })
      }
    )
    .get('/telegram/profile/:telegramUserId', async ({ headers, params }): Promise<TelegramCabinetProfile> => {
      requireTelegramBot(headers)
      return getTelegramProfile(params.telegramUserId)
    })
}
