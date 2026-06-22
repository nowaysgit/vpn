#!/usr/bin/env bun
import { createEmailSender } from '../../apps/backend/src/lib/email'

const resultPath = process.env.EMAIL_SMOKE_RESULT_PATH ?? 'output/email-smoke.json'
const marker = process.env.EMAIL_SMOKE_MARKER ?? `smoke_${Date.now()}_${Math.random().toString(16).slice(2)}`
const strict = process.env.EXTERNAL_SMOKE_STRICT === 'true'
const recipients = (process.env.EMAIL_SMOKE_TO ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

if (recipients.length === 0) {
  const message = 'Yandex 360 email smoke skipped: set EMAIL_SMOKE_TO to one or more comma-separated recipients.'
  if (strict) {
    console.error(message)
    process.exit(1)
  }

  console.log(message)
  process.exit(0)
}

const required = ['EMAIL_SMTP_USER', 'EMAIL_SMTP_PASSWORD', 'EMAIL_FROM']
const missing = required.filter((key) => !process.env[key])
if (missing.length > 0) {
  const message = `Yandex 360 email smoke skipped: missing ${missing.join(', ')}.`
  if (strict) {
    console.error(message)
    process.exit(1)
  }

  console.log(message)
  process.exit(0)
}

process.env.EMAIL_PROVIDER = 'smtp'

const sender = createEmailSender()
const sent: Array<{ to: string; code: string }> = []

for (const [index, recipient] of recipients.entries()) {
  const code = String((Date.now() + index) % 1_000_000).padStart(6, '0')

  await sender.sendVerificationEmail({
    to: recipient,
    name: 'Smoke Test',
    code,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  })
  sent.push({ to: recipient, code })
  console.log(`Sent verification smoke email to ${recipient}`)
}

await Bun.write(
  resultPath,
  `${JSON.stringify(
    {
      marker,
      sentAt: new Date().toISOString(),
      messages: sent
    },
    null,
    2
  )}\n`
)

console.log(`Yandex 360 email smoke finished. Result marker saved to ${resultPath}.`)
console.log('Run bun run check:email-delivery to verify inbox placement for Yandex/Mail.ru/Gmail test accounts.')
