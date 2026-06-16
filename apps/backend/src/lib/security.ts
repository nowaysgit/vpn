import { createHmac, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

const DEFAULT_SECRET = 'dev-secret-change-me'

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, {
    algorithm: 'argon2id',
    memoryCost: 19456,
    timeCost: 2
  })
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash)
}

export function signToken(payload: string, secret = process.env.JWT_ACCESS_SECRET ?? DEFAULT_SECRET): string {
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${Buffer.from(payload).toString('base64url')}.${signature}`
}

export function verifySignedToken(token: string, secret = process.env.JWT_ACCESS_SECRET ?? DEFAULT_SECRET): string | null {
  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null

  const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8')
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const expectedBuffer = Buffer.from(expected)
  const signatureBuffer = Buffer.from(signature)

  if (expectedBuffer.length !== signatureBuffer.length) return null
  return timingSafeEqual(expectedBuffer, signatureBuffer) ? payload : null
}

export function encryptJson(value: unknown, keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY): string {
  const key = encryptionKey(keyHex)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()

  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.')
}

export function decryptJson<T>(payload: string, keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY): T {
  const [ivEncoded, tagEncoded, ciphertextEncoded] = payload.split('.')
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error('Invalid encrypted payload')

  const key = encryptionKey(keyHex)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivEncoded, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, 'base64url')),
    decipher.final()
  ])

  return JSON.parse(decrypted.toString('utf8')) as T
}

function encryptionKey(keyHex: string | undefined): Buffer {
  if (!keyHex) return Buffer.alloc(32, 0)

  const normalized = keyHex.trim()
  if (/^[0-9a-fA-F]{64}$/.test(normalized)) return Buffer.from(normalized, 'hex')

  return createHmac('sha256', DEFAULT_SECRET).update(normalized).digest()
}
