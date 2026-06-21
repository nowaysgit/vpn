import { spawn, spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const args = process.argv.slice(2)
const root = process.cwd()
const outputDir = join(root, 'output')
const wrapperLogPath = join(outputDir, 'e2e-wrapper.log')
const serviceLogPath = join(outputDir, 'e2e-services.log')
const testLogPath = join(outputDir, 'playwright-run.log')
const emailOutboxPath = join(outputDir, 'email-outbox.jsonl')
const services = []

mkdirSync(outputDir, { recursive: true })
writeFileSync(serviceLogPath, '')
writeFileSync(emailOutboxPath, '')

if (process.env.E2E_CLEAN_CHILD !== '1' && process.env.npm_lifecycle_event) {
  const code = await runCleanChild()
  printFile(wrapperLogPath, code === 0 ? undefined : 200)
  process.exit(code)
}

try {
  services.push(
    startService('backend', ['run', '--cwd', 'apps/backend', 'start'], {
      NODE_ENV: 'test',
      PORT: '3001',
      JWT_ACCESS_SECRET: 'test-secret',
      CREDENTIAL_ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000000',
      EMAIL_DELIVERY_MODE: 'outbox',
      EMAIL_DEV_OUTBOX_PATH: emailOutboxPath
    })
  )
  services.push(
    startService('customer-web', ['run', '--cwd', 'apps/customer-web', 'serve:built'], {
      NODE_ENV: 'test',
      HOST: '0.0.0.0',
      PORT: '3000',
      API_BASE_URL: 'http://127.0.0.1:3001'
    })
  )
  services.push(
    startService('admin-web', ['run', '--cwd', 'apps/admin-web', 'serve:built'], {
      NODE_ENV: 'test',
      HOST: '0.0.0.0',
      PORT: '3002',
      API_BASE_URL: 'http://127.0.0.1:3001'
    })
  )

  await Promise.all([
    waitForUrl('http://127.0.0.1:3001/health', 'backend'),
    waitForUrl('http://127.0.0.1:3000', 'customer-web'),
    waitForUrl('http://127.0.0.1:3002', 'admin-web')
  ])

  const code = await runPlaywright(args)
  printFile(testLogPath, code === 0 ? undefined : 160)
  process.exitCode = code
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  printFile(serviceLogPath, 160)
  printFile(testLogPath, 160)
  process.exitCode = 1
} finally {
  for (const service of services.reverse()) stopService(service)
}

function startService(name, commandArgs, env) {
  const logFd = openSync(serviceLogPath, 'a')
  const child = spawn('bun', commandArgs, {
    cwd: root,
    env: childEnv(env),
    stdio: ['ignore', logFd, logFd],
    shell: false
  })

  return { name, child, logFd }
}

async function runCleanChild() {
  const logFd = openSync(wrapperLogPath, 'w')
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], {
    cwd: root,
    detached: true,
    env: childEnv({ E2E_CLEAN_CHILD: '1' }),
    stdio: ['ignore', logFd, logFd],
    shell: false
  })

  const code = await new Promise((resolve, reject) => {
    child.on('exit', (exitCode) => resolve(exitCode ?? 1))
    child.on('error', reject)
  })
  closeSync(logFd)

  return code
}

async function waitForUrl(url, name) {
  const deadline = Date.now() + 120_000

  while (Date.now() < deadline) {
    const service = services.find((item) => item.name === name)
    if (service?.child.exitCode !== null) throw new Error(`${name} exited before becoming ready`)

    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Service is still booting.
    }

    await sleep(500)
  }

  throw new Error(`${name} did not become ready at ${url}`)
}

async function runPlaywright(commandArgs) {
  const binName = process.platform === 'win32' ? 'playwright.exe' : 'playwright'
  const playwrightBin = join(root, 'node_modules', '.bin', binName)
  if (!existsSync(playwrightBin)) throw new Error(`Playwright binary was not found at ${playwrightBin}`)

  const logFd = openSync(testLogPath, 'w')
  const child = spawn(playwrightBin, ['test', ...commandArgs], {
    cwd: root,
    env: childEnv({ PLAYWRIGHT_SKIP_WEBSERVER: '1', EMAIL_DEV_OUTBOX_PATH: emailOutboxPath }),
    stdio: ['ignore', logFd, logFd],
    shell: false
  })

  const code = await new Promise((resolve, reject) => {
    child.on('exit', (exitCode) => resolve(exitCode ?? 1))
    child.on('error', reject)
  })
  closeSync(logFd)

  return code
}

function stopService(service) {
  if (service.child.exitCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(service.child.pid), '/t', '/f'], {
        stdio: 'ignore'
      })
    } else {
      service.child.kill('SIGTERM')
    }
  }
  closeSync(service.logFd)
}

function printFile(path, tailLines) {
  if (!existsSync(path)) return
  const content = readFileSync(path, 'utf8').trimEnd()
  if (!content) return
  const lines = content.split(/\r?\n/)
  const visible = tailLines ? lines.slice(-tailLines) : lines
  console.log(visible.join('\n'))
}

function childEnv(overrides) {
  const env = { ...process.env, ...overrides }

  for (const key of Object.keys(env)) {
    if (key.toLowerCase().startsWith('npm_')) delete env[key]
    if (key.startsWith('BUN_')) delete env[key]
  }

  delete env.INIT_CWD

  return env
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
