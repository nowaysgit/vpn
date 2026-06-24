import { createHmac } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { db, type DbExecutor } from '../../db'
import { emailVerificationTokens, sessions, users } from '../../db/schema'
import type { User } from '../../lib/domain'
import type { EmailSender } from '../../lib/email'
import { AppError, notFound } from '../../lib/errors'
import { createId, createToken } from '../../lib/id'
import { hashPassword, signToken, verifyPassword } from '../../lib/security'
import { now } from '../../lib/time'
import { hashSessionToken } from '../../services/access-control.service'
import { requireEntity } from '../../services/entity.service'

type RegisterInput = {
  email: string
  name: string
  password: string
}

type RegisterSuccess = {
  userId: string
  email: string
  verificationEmailSent: true
  resendAvailableAt: string
}

type AuthStatusResult<T> =
  | { status: 200; body: T }
  | { status: 201; body: T }
  | { status: 409; body: { code: 'VALIDATION_ERROR'; message: string } }
  | { status: 429; body: { code: 'VALIDATION_ERROR'; message: string; resendAvailableAt: string } }

export async function registerUser(emailSender: EmailSender, input: RegisterInput): Promise<AuthStatusResult<RegisterSuccess>> {
  const email = normalizeEmail(input.email)
  const existing = await findUserByEmail(email)
  if (existing?.emailVerified) {
    return { status: 409, body: { code: 'VALIDATION_ERROR', message: 'Email is already registered' } }
  }

  const passwordHash = await hashPassword(input.password)
  const user: User =
    existing ??
    {
      id: createId('usr'),
      email,
      name: input.name.trim(),
      passwordHash,
      emailVerified: false,
      role: 'customer',
      blocked: false,
      notes: null,
      subscriptionToken: createToken('subtok'),
      createdAt: now()
    }

  const verification = await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(users)
        .set({ name: input.name.trim(), passwordHash })
        .where(eq(users.id, existing.id))
    } else {
      await tx.insert(users).values(user)
    }

    return createEmailVerification(tx, user)
  })

  if ('error' in verification) return verificationErrorResult(verification)

  try {
    await emailSender.sendVerificationEmail({
      to: user.email,
      name: user.name,
      code: verification.code,
      expiresAt: verification.expiresAt
    })
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Verification email could not be sent', 502)
  }

  return {
    status: 201,
    body: {
      userId: user.id,
      email: user.email,
      verificationEmailSent: true,
      resendAvailableAt: verification.resendAvailableAt.toISOString()
    }
  }
}

export async function resendVerificationEmail(
  emailSender: EmailSender,
  rawEmail: string
): Promise<AuthStatusResult<{ email: string; verificationEmailSent: true; resendAvailableAt: string }>> {
  const email = normalizeEmail(rawEmail)
  const user = await findUserByEmail(email)
  if (!user) throw notFound('Account was not registered')
  if (user.emailVerified) {
    return { status: 409, body: { code: 'VALIDATION_ERROR', message: 'Email is already verified' } }
  }

  const verification = await db.transaction((tx) => createEmailVerification(tx, user))
  if ('error' in verification) return verificationErrorResult(verification)

  await emailSender.sendVerificationEmail({
    to: user.email,
    name: user.name,
    code: verification.code,
    expiresAt: verification.expiresAt
  })

  return {
    status: 200,
    body: {
      email: user.email,
      verificationEmailSent: true,
      resendAvailableAt: verification.resendAvailableAt.toISOString()
    }
  }
}

export async function verifyEmail(rawEmail: string, code: string): Promise<{ ok: true }> {
  const email = normalizeEmail(rawEmail)
  const user = requireEntity(await findUserByEmail(email), 'User not found')
  const codeHash = emailVerificationCodeHash(email, code)
  const [token] = await db
    .select()
    .from(emailVerificationTokens)
    .where(and(eq(emailVerificationTokens.userId, user.id), eq(emailVerificationTokens.token, codeHash)))
    .limit(1)

  if (!token || token.usedAt || token.expiresAt < now()) throw notFound('Verification code is invalid or expired')

  await db.transaction(async (tx) => {
    await tx.update(users).set({ emailVerified: true }).where(eq(users.id, user.id))
    await tx.update(emailVerificationTokens).set({ usedAt: now() }).where(eq(emailVerificationTokens.token, token.token))
  })

  return { ok: true }
}

export async function loginUser(rawEmail: string, password: string) {
  const user = await findUserByEmail(normalizeEmail(rawEmail))
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError('AUTH_REQUIRED', 'Invalid email or password', 401)
  }
  if (user.blocked) throw new AppError('AUTH_REQUIRED', 'User is blocked', 403)
  if (!user.emailVerified) throw new AppError('EMAIL_NOT_VERIFIED', 'Verify email before login', 403)

  const token = signToken(`${user.id}:${Date.now()}`)
  await db.insert(sessions).values({
    id: createId('sess'),
    userId: user.id,
    tokenHash: hashSessionToken(token),
    createdAt: now(),
    expiresAt: sessionExpiresAt()
  })

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified
    }
  }
}

async function findUserByEmail(email: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  return user ?? null
}

async function createEmailVerification(
  executor: DbExecutor,
  user: User
): Promise<{ token: string; code: string; expiresAt: Date; resendAvailableAt: Date } | { error: string; status: 429; resendAvailableAt: Date }> {
  const current = now()
  const [existing] = await executor
    .select()
    .from(emailVerificationTokens)
    .where(and(eq(emailVerificationTokens.userId, user.id), gt(emailVerificationTokens.expiresAt, current)))
    .limit(1)

  if (existing && !existing.usedAt && existing.resendAvailableAt > current) {
    return {
      status: 429,
      error: 'Verification code can be resent later',
      resendAvailableAt: existing.resendAvailableAt
    }
  }

  const code = emailVerificationCode()
  const expiresAt = new Date(current.getTime() + emailVerificationTtlMinutes() * 60_000)
  const resendAvailableAt = new Date(current.getTime() + emailVerificationResendCooldownSeconds() * 1000)
  const token = emailVerificationCodeHash(user.email, code)

  await executor
    .update(emailVerificationTokens)
    .set({ usedAt: current })
    .where(and(eq(emailVerificationTokens.userId, user.id), gt(emailVerificationTokens.expiresAt, current)))
  await executor.insert(emailVerificationTokens).values({
    token,
    userId: user.id,
    expiresAt,
    resendAvailableAt,
    usedAt: null
  })

  return { token, code, expiresAt, resendAvailableAt }
}

function verificationErrorResult<T>(verification: { error: string; status: 429; resendAvailableAt: Date }): AuthStatusResult<T> {
  return {
    status: verification.status,
    body: {
      code: 'VALIDATION_ERROR',
      message: verification.error,
      resendAvailableAt: verification.resendAvailableAt.toISOString()
    }
  }
}

function emailVerificationCode(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
  return String(value % 1_000_000).padStart(6, '0')
}

function emailVerificationCodeHash(email: string, code: string): string {
  const secret = process.env.EMAIL_VERIFICATION_SECRET ?? process.env.JWT_ACCESS_SECRET ?? 'dev-email-verification-secret'
  return createHmac('sha256', secret)
    .update(`${normalizeEmail(email)}:${code.trim()}`)
    .digest('base64url')
}

function emailVerificationTtlMinutes(): number {
  const value = Number(process.env.EMAIL_VERIFICATION_TTL_MIN ?? 15)
  return Number.isFinite(value) && value > 0 ? value : 15
}

function emailVerificationResendCooldownSeconds(): number {
  const value = Number(process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SEC ?? 60)
  return Number.isFinite(value) && value > 0 ? value : 60
}

function sessionExpiresAt(): Date {
  const days = Number(process.env.AUTH_SESSION_TTL_DAYS ?? 30)
  const ttlDays = Number.isFinite(days) && days > 0 ? days : 30
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000)
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
