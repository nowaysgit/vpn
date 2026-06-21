import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const outboxPath = process.env.EMAIL_DEV_OUTBOX_PATH ?? join(process.cwd(), 'output', 'email-outbox.jsonl')

export async function verificationEmailFor(email) {
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    const messages = await readOutbox()
    const message = messages.reverse().find((item) => item.type === 'email.verification' && item.to === email)
    if (message) return message
    await sleep(250)
  }

  throw new Error(`Verification email for ${email} was not written to ${outboxPath}`)
}

async function readOutbox() {
  if (!existsSync(outboxPath)) return []

  const content = await readFile(outboxPath, 'utf8')
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
