#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { connect as tlsConnect, type TLSSocket } from 'node:tls'

type DeliveryConfig = {
  marker?: string
  resultPath?: string
  timeoutSeconds?: number
  accounts: AccountConfig[]
}

type AccountConfig = {
  name?: string
  address: string
  host?: string
  port?: number
  username?: string
  password?: string
  passwordEnv?: string
  inboxMailboxes?: string[]
  spamMailboxes?: string[]
}

type SmokeResult = {
  marker: string
  messages: Array<{ to: string; code: string }>
}

const config = await loadConfig()
const strict = process.env.EXTERNAL_SMOKE_STRICT === 'true'

if (!config) {
  const message = 'Email delivery check skipped: set EMAIL_DELIVERY_CHECK_CONFIG or EMAIL_DELIVERY_CHECKS_JSON.'
  if (strict) {
    console.error(message)
    process.exit(1)
  }

  console.log(message)
  process.exit(0)
}

const resultPath = config.resultPath ?? process.env.EMAIL_SMOKE_RESULT_PATH ?? 'output/email-smoke.json'
const marker = config.marker ?? process.env.EMAIL_DELIVERY_MARKER ?? (await loadSmokeMarker(resultPath))

if (!marker) {
  const message = 'Email delivery check skipped: no marker found. Run smoke:yandex360-email first or set EMAIL_DELIVERY_MARKER.'
  if (strict) {
    console.error(message)
    process.exit(1)
  }

  console.log(message)
  process.exit(0)
}

const timeoutMs = (config.timeoutSeconds ?? Number(process.env.EMAIL_DELIVERY_TIMEOUT_SECONDS ?? 120)) * 1000
const deadline = Date.now() + timeoutMs
const failures: string[] = []

for (const account of config.accounts) {
  const resolved = resolveAccount(account)
  console.log(`Checking ${resolved.name} (${resolved.address}) via ${resolved.host}:${resolved.port}`)

  try {
    const placement = await waitForPlacement(resolved, marker, deadline)

    if (placement.kind === 'inbox') {
      console.log(`Inbox OK: ${resolved.address} in ${placement.mailbox}`)
    } else if (placement.kind === 'spam') {
      failures.push(`${resolved.address} received the smoke email in spam mailbox ${placement.mailbox}.`)
    } else {
      failures.push(`${resolved.address} did not receive the smoke marker in inbox before timeout.`)
    }
  } catch (error) {
    failures.push(`${resolved.address} check failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`Delivery check failed: ${failure}`)
  process.exit(1)
}

console.log('Email delivery check passed for all configured accounts.')

async function loadConfig(): Promise<DeliveryConfig | null> {
  const inline = process.env.EMAIL_DELIVERY_CHECKS_JSON
  if (inline) return JSON.parse(inline) as DeliveryConfig

  const path = process.env.EMAIL_DELIVERY_CHECK_CONFIG ?? 'email-delivery-checks.json'
  if (!existsSync(path)) return null

  return JSON.parse(await readFile(path, 'utf8')) as DeliveryConfig
}

async function loadSmokeMarker(path: string): Promise<string | null> {
  if (!existsSync(path)) return null
  const result = JSON.parse(await readFile(path, 'utf8')) as SmokeResult
  return result.marker
}

function resolveAccount(account: AccountConfig): Required<AccountConfig> {
  const domain = account.address.split('@')[1]?.toLowerCase() ?? ''
  const defaults = providerDefaults(domain)
  const password = account.password ?? (account.passwordEnv ? process.env[account.passwordEnv] : undefined)

  if (!password) {
    const source = account.passwordEnv ? account.passwordEnv : `password for ${account.address}`
    throw new Error(`Missing IMAP ${source}`)
  }

  return {
    name: account.name ?? account.address,
    address: account.address,
    host: account.host ?? defaults.host,
    port: account.port ?? 993,
    username: account.username ?? account.address,
    password,
    passwordEnv: account.passwordEnv ?? '',
    inboxMailboxes: account.inboxMailboxes ?? defaults.inboxMailboxes,
    spamMailboxes: account.spamMailboxes ?? defaults.spamMailboxes
  }
}

function providerDefaults(domain: string): Pick<Required<AccountConfig>, 'host' | 'inboxMailboxes' | 'spamMailboxes'> {
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return {
      host: 'imap.gmail.com',
      inboxMailboxes: ['INBOX'],
      spamMailboxes: ['[Gmail]/Spam', 'Spam']
    }
  }

  if (domain === 'mail.ru' || domain.endsWith('.mail.ru')) {
    return {
      host: 'imap.mail.ru',
      inboxMailboxes: ['INBOX'],
      spamMailboxes: ['Spam']
    }
  }

  return {
    host: 'imap.yandex.com',
    inboxMailboxes: ['INBOX'],
    spamMailboxes: ['Spam']
  }
}

async function waitForPlacement(
  account: Required<AccountConfig>,
  marker: string,
  deadline: number
): Promise<{ kind: 'inbox' | 'spam' | 'missing'; mailbox?: string }> {
  while (Date.now() < deadline) {
    const inbox = await findMarker(account, account.inboxMailboxes, marker)
    if (inbox) return { kind: 'inbox', mailbox: inbox }

    const spam = await findMarker(account, account.spamMailboxes, marker)
    if (spam) return { kind: 'spam', mailbox: spam }

    await sleep(10_000)
  }

  return { kind: 'missing' }
}

async function findMarker(account: Required<AccountConfig>, mailboxes: string[], marker: string): Promise<string | null> {
  const client = await ImapClient.connect(account.host, account.port)

  try {
    await client.login(account.username, account.password)

    for (const mailbox of mailboxes) {
      try {
        await client.examine(mailbox)
        if (await client.searchText(marker)) return mailbox
      } catch {
        // Mailbox names differ between providers/locales; try the next configured candidate.
      }
    }

    return null
  } finally {
    await client.logout().catch(() => undefined)
  }
}

class ImapClient {
  private buffer = ''
  private tagCounter = 0
  private wake: (() => void) | null = null
  private error: Error | null = null

  private constructor(private readonly socket: TLSSocket) {
    socket.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8')
      this.wake?.()
    })
    socket.once('error', (error) => {
      this.error = error
      this.wake?.()
    })
    socket.once('close', () => {
      this.error = this.error ?? new Error('IMAP connection closed')
      this.wake?.()
    })
  }

  static async connect(host: string, port: number): Promise<ImapClient> {
    const socket = tlsConnect({ host, port, servername: host })
    await new Promise<void>((resolve, reject) => {
      socket.once('secureConnect', resolve)
      socket.once('error', reject)
    })

    const client = new ImapClient(socket)
    const greeting = await client.readLine()
    if (!greeting.startsWith('* OK') && !greeting.startsWith('* PREAUTH')) {
      throw new Error(`Unexpected IMAP greeting: ${greeting}`)
    }

    return client
  }

  login(username: string, password: string): Promise<string[]> {
    return this.command(`LOGIN ${imapString(username)} ${imapString(password)}`)
  }

  examine(mailbox: string): Promise<string[]> {
    return this.command(`EXAMINE ${imapString(mailbox)}`)
  }

  async searchText(marker: string): Promise<boolean> {
    const lines = await this.command(`UID SEARCH TEXT ${imapString(marker)}`)
    return lines.some((line) => /^\* SEARCH\s+\d/.test(line))
  }

  logout(): Promise<string[]> {
    return this.command('LOGOUT')
  }

  private async command(command: string): Promise<string[]> {
    const tag = `A${++this.tagCounter}`
    await this.write(`${tag} ${command}\r\n`)

    const lines: string[] = []
    while (true) {
      const line = await this.readLine()
      lines.push(line)

      if (line.startsWith(`${tag} `)) {
        if (!line.startsWith(`${tag} OK`)) throw new Error(line)
        return lines
      }
    }
  }

  private async write(value: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.write(value, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  private async readLine(): Promise<string> {
    while (true) {
      if (this.error) throw this.error

      const newlineIndex = this.buffer.indexOf('\n')
      if (newlineIndex >= 0) {
        const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '')
        this.buffer = this.buffer.slice(newlineIndex + 1)
        return line
      }

      await new Promise<void>((resolve) => {
        this.wake = resolve
      })
      this.wake = null
    }
  }
}

function imapString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
