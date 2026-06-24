import type { TelegramCabinetProfile, TelegramLinkToken } from '@vpn/api-contract'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { telegramAccounts, telegramLinkTokens, users } from '../../db/schema'
import type { User } from '../../lib/domain'
import { notFound } from '../../lib/errors'
import { createToken } from '../../lib/id'
import { addDays, now } from '../../lib/time'
import { requireEntity } from '../../services/entity.service'
import { customerProfile } from '../customer/customer.service'

type LinkTelegramAccountInput = {
  token: string
  telegramUserId: string
  username?: string
}

export async function createTelegramLinkToken(user: User): Promise<TelegramLinkToken> {
  const token = createToken('tglink')
  const link = {
    token,
    userId: user.id,
    expiresAt: addDays(now(), 1),
    usedAt: null
  }
  await db.insert(telegramLinkTokens).values(link)

  return {
    token,
    expiresAt: link.expiresAt.toISOString()
  }
}

export async function linkTelegramAccount(input: LinkTelegramAccountInput): Promise<{ ok: true; email: string }> {
  return db.transaction(async (tx) => {
    const [token] = await tx
      .select()
      .from(telegramLinkTokens)
      .where(eq(telegramLinkTokens.token, input.token))
      .limit(1)
    if (!token || token.usedAt || token.expiresAt < now()) throw notFound('Telegram link token is invalid or expired')

    const user = requireEntity(
      (
        await tx
          .select()
          .from(users)
          .where(eq(users.id, token.userId))
          .limit(1)
      )[0],
      'User not found'
    )
    const linkedAt = now()
    await tx
      .update(telegramLinkTokens)
      .set({ usedAt: linkedAt })
      .where(eq(telegramLinkTokens.token, token.token))
    await tx
      .insert(telegramAccounts)
      .values({
        telegramUserId: input.telegramUserId,
        userId: user.id,
        username: input.username ?? null,
        linkedAt
      })
      .onConflictDoUpdate({
        target: telegramAccounts.telegramUserId,
        set: {
          userId: user.id,
          username: input.username ?? null,
          linkedAt
        }
      })

    return {
      ok: true,
      email: user.email
    }
  })
}

export async function getTelegramProfile(telegramUserId: string): Promise<TelegramCabinetProfile> {
  const account = requireEntity(
    (
      await db
        .select()
        .from(telegramAccounts)
        .where(eq(telegramAccounts.telegramUserId, telegramUserId))
        .limit(1)
    )[0],
    'Telegram account is not linked'
  )
  const user = requireEntity(
    (
      await db
        .select()
        .from(users)
        .where(eq(users.id, account.userId))
        .limit(1)
    )[0],
    'User not found'
  )

  return {
    ...(await customerProfile(user)),
    telegramUserId: account.telegramUserId
  }
}
