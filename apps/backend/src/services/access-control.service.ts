import { and, eq, gt } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { db } from '../db'
import { sessions, users } from '../db/schema'
import type { User } from '../lib/domain'
import { AppError } from '../lib/errors'
import { verifySignedToken } from '../lib/security'

export async function requireUser(authorization: string | undefined): Promise<User> {
  if (!authorization?.startsWith('Bearer ')) throw new AppError('AUTH_REQUIRED', 'Authorization token is required', 401)

  const token = authorization.slice('Bearer '.length)
  const payload = verifySignedToken(token)
  if (!payload) throw new AppError('AUTH_REQUIRED', 'Authorization token is invalid', 401)

  const [tokenUserId] = payload.split(':')
  if (!tokenUserId) throw new AppError('AUTH_REQUIRED', 'Authorization token is invalid', 401)

  const [row] = await db
    .select({
      user: users,
      sessionUserId: sessions.userId
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1)

  if (!row || row.sessionUserId !== tokenUserId) throw new AppError('AUTH_REQUIRED', 'Session not found', 401)
  if (row.user.blocked) throw new AppError('AUTH_REQUIRED', 'User is blocked', 403)

  return row.user
}

export async function requireAdmin(authorization: string | undefined): Promise<User> {
  const user = await requireUser(authorization)
  if (!['owner', 'admin', 'support'].includes(user.role)) throw new AppError('AUTH_REQUIRED', 'Admin role is required', 403)
  return user
}

export function requireTelegramBot(headers: Record<string, string | undefined>): void {
  if (process.env.NODE_ENV === 'test') return
  const configuredSecret = process.env.TELEGRAM_BOT_SECRET
  if (!configuredSecret && process.env.NODE_ENV !== 'production') return
  if (!configuredSecret) throw new AppError('AUTH_REQUIRED', 'Telegram bot secret is not configured', 500)
  if (headers['x-telegram-bot-secret'] !== configuredSecret) {
    throw new AppError('AUTH_REQUIRED', 'Telegram bot secret is invalid', 401)
  }
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
