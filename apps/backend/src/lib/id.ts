export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}

export function createToken(prefix: string): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const body = Buffer.from(bytes).toString('base64url')
  return `${prefix}_${body}`
}
