import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { connect as tlsConnect, type TLSSocket } from 'node:tls'

export type VerificationEmailInput = {
  to: string
  name: string
  token: string
  verificationUrl: string
  expiresAt: Date
}

export interface EmailSender {
  sendVerificationEmail(input: VerificationEmailInput): Promise<void>
}

type SmtpConfig = {
  host: string
  port: number
  username: string
  password: string
  fromEmail: string
  fromName: string
}

export function createEmailSender(): EmailSender {
  const mode = process.env.EMAIL_DELIVERY_MODE ?? (process.env.NODE_ENV === 'production' ? 'smtp' : 'outbox')

  if (mode === 'smtp') return new SmtpEmailSender(smtpConfig())
  return new DevOutboxEmailSender(process.env.EMAIL_DEV_OUTBOX_PATH ?? 'output/email-outbox.jsonl')
}

function smtpConfig(): SmtpConfig {
  const username = process.env.YANDEX360_SMTP_USERNAME
  const password = process.env.YANDEX360_SMTP_PASSWORD
  const fromEmail = process.env.YANDEX360_FROM_EMAIL ?? username

  if (!username) throw new Error('YANDEX360_SMTP_USERNAME is required')
  if (!password) throw new Error('YANDEX360_SMTP_PASSWORD is required')
  if (!fromEmail) throw new Error('YANDEX360_FROM_EMAIL is required')

  return {
    host: process.env.YANDEX360_SMTP_HOST ?? 'smtp.yandex.com',
    port: Number(process.env.YANDEX360_SMTP_PORT ?? 465),
    username,
    password,
    fromEmail,
    fromName: process.env.YANDEX360_FROM_NAME ?? 'VPN Cabinet'
  }
}

class DevOutboxEmailSender implements EmailSender {
  constructor(private readonly path: string) {}

  async sendVerificationEmail(input: VerificationEmailInput): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    await appendFile(
      this.path,
      `${JSON.stringify({
        type: 'email.verification',
        to: input.to,
        name: input.name,
        token: input.token,
        verificationUrl: input.verificationUrl,
        expiresAt: input.expiresAt.toISOString(),
        createdAt: new Date().toISOString()
      })}\n`,
      'utf8'
    )
  }
}

class SmtpEmailSender implements EmailSender {
  constructor(private readonly config: SmtpConfig) {}

  async sendVerificationEmail(input: VerificationEmailInput): Promise<void> {
    const message = verificationMessage(this.config, input)
    const socket = await connectTls(this.config.host, this.config.port)

    try {
      await expectResponse(socket, 220)
      await command(socket, `EHLO ${process.env.API_DOMAIN ?? 'localhost'}`, 250)
      await command(socket, 'AUTH LOGIN', 334)
      await command(socket, Buffer.from(this.config.username, 'utf8').toString('base64'), 334)
      await command(socket, Buffer.from(this.config.password, 'utf8').toString('base64'), 235)
      await command(socket, `MAIL FROM:<${this.config.fromEmail}>`, 250)
      await command(socket, `RCPT TO:<${input.to}>`, [250, 251])
      await command(socket, 'DATA', 354)
      await write(socket, `${dotStuff(message)}\r\n.`)
      await expectResponse(socket, 250)
      await command(socket, 'QUIT', 221)
    } finally {
      socket.end()
    }
  }
}

function verificationMessage(config: SmtpConfig, input: VerificationEmailInput): string {
  const subject = 'Verify your VPN account'
  const text = [
    `Hello ${input.name},`,
    '',
    'Confirm your email address to continue:',
    input.verificationUrl,
    '',
    `This link expires at ${input.expiresAt.toISOString()}.`,
    '',
    'If you did not create this account, ignore this email.'
  ].join('\r\n')

  return [
    `Date: ${new Date().toUTCString()}`,
    `From: ${mailbox(config.fromName, config.fromEmail)}`,
    `To: <${input.to}>`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text
  ].join('\r\n')
}

function mailbox(name: string, email: string): string {
  return `"${encodeHeader(name).replace(/"/g, '\\"')}" <${email}>`
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

function dotStuff(value: string): string {
  return value.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..')
}

async function connectTls(host: string, port: number): Promise<TLSSocket> {
  const socket = tlsConnect({ host, port, servername: host })
  await new Promise<void>((resolve, reject) => {
    socket.once('secureConnect', resolve)
    socket.once('error', reject)
  })
  return socket
}

async function command(socket: TLSSocket, line: string, expected: number | number[]): Promise<void> {
  await write(socket, line)
  await expectResponse(socket, expected)
}

async function write(socket: TLSSocket, line: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.write(`${line}\r\n`, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function expectResponse(socket: TLSSocket, expected: number | number[]): Promise<void> {
  const response = await readResponse(socket)
  const allowed = Array.isArray(expected) ? expected : [expected]

  if (!allowed.includes(response.code)) {
    throw new Error(`SMTP command failed with ${response.code}: ${response.lines.join(' ')}`)
  }
}

function readResponse(socket: TLSSocket): Promise<{ code: number; lines: string[] }> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const lines: string[] = []

    function cleanup(): void {
      socket.off('data', onData)
      socket.off('error', onError)
      socket.off('close', onClose)
    }

    function onError(error: Error): void {
      cleanup()
      reject(error)
    }

    function onClose(): void {
      cleanup()
      reject(new Error('SMTP connection closed'))
    }

    function onData(chunk: Buffer): void {
      buffer += chunk.toString('utf8')
      let newlineIndex = buffer.indexOf('\n')

      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
        buffer = buffer.slice(newlineIndex + 1)
        lines.push(line)

        if (/^\d{3} /.test(line)) {
          cleanup()
          resolve({ code: Number(line.slice(0, 3)), lines })
          return
        }

        newlineIndex = buffer.indexOf('\n')
      }
    }

    socket.on('data', onData)
    socket.once('error', onError)
    socket.once('close', onClose)
  })
}
