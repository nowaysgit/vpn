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
const databaseUrl = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/vpn_test'
const apiPort = process.env.API_E2E_PORT ?? '3101'
const customerPort = process.env.CUSTOMER_E2E_PORT ?? '3100'
const adminPort = process.env.ADMIN_E2E_PORT ?? '3102'
const apiUrl = `http://127.0.0.1:${apiPort}`
const customerUrl = `http://127.0.0.1:${customerPort}`
const adminUrl = `http://127.0.0.1:${adminPort}`
const services = []

mkdirSync(outputDir, { recursive: true })
writeFileSync(serviceLogPath, '')
writeFileSync(emailOutboxPath, '')

if (
  process.env.E2E_CLEAN_CHILD !== '1' &&
  (process.env.npm_lifecycle_event || process.env.E2E_FORCE_CLEAN_CHILD === '1')
) {
  const code = await runCleanChild()
  printFile(wrapperLogPath, code === 0 ? undefined : 200)
  process.exit(code)
}

try {
  run('bun', ['run', '--cwd', 'apps/backend', 'migrate'], {
    DATABASE_URL: databaseUrl
  })

  services.push(
    startService('backend', ['run', '--cwd', 'apps/backend', 'start'], {
      NODE_ENV: 'test',
      PORT: apiPort,
      DATABASE_URL: databaseUrl,
      API_PUBLIC_URL: apiUrl,
      APP_PUBLIC_URL: customerUrl,
      JWT_ACCESS_SECRET: 'test-secret',
      CREDENTIAL_ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000000',
      EMAIL_PROVIDER: 'outbox',
      EMAIL_DEV_OUTBOX_PATH: emailOutboxPath
    })
  )
  services.push(
    startService('customer-web', ['run', '--cwd', 'apps/customer-web', 'serve:built'], {
      NODE_ENV: 'test',
      HOST: '0.0.0.0',
      PORT: customerPort,
      NUXT_PUBLIC_API_BASE_URL: apiUrl
    })
  )
  services.push(
    startService('admin-web', ['run', '--cwd', 'apps/admin-web', 'serve:built'], {
      NODE_ENV: 'test',
      HOST: '0.0.0.0',
      PORT: adminPort,
      NUXT_PUBLIC_API_BASE_URL: apiUrl
    })
  )

  await Promise.all([
    waitForUrl(`${apiUrl}/health`, 'backend'),
    waitForUrl(customerUrl, 'customer-web'),
    waitForUrl(adminUrl, 'admin-web')
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

function run(command, commandArgs, env) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env: childEnv(env),
    stdio: 'inherit',
    shell: false
  })

  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed with exit code ${result.status ?? 1}`)
  }
}

async function runCleanChild() {
  const logFd = openSync(wrapperLogPath, 'w')
  const child = spawn(realNodeExecutable(), [fileURLToPath(import.meta.url), ...args], {
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
    env: childEnv({
      PLAYWRIGHT_SKIP_WEBSERVER: '1',
      EMAIL_DEV_OUTBOX_PATH: emailOutboxPath,
      API_E2E_URL: apiUrl,
      CUSTOMER_E2E_URL: customerUrl,
      ADMIN_E2E_URL: adminUrl
    }),
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

  sanitizePath(env)
  delete env.INIT_CWD

  return env
}

function sanitizePath(env) {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path')
  if (!pathKey || !env[pathKey]) return

  env[pathKey] = String(env[pathKey])
    .split(process.platform === 'win32' ? ';' : ':')
    .filter((entry) => !entry.toLowerCase().includes(`${process.platform === 'win32' ? '\\' : '/'}temp${process.platform === 'win32' ? '\\' : '/'}bun-node-`))
    .join(process.platform === 'win32' ? ';' : ':')
}

function realNodeExecutable() {
  if (process.platform !== 'win32' || !process.execPath.toLowerCase().includes('\\temp\\bun-node-')) {
    return process.execPath
  }

  const result = spawnSync('where.exe', ['node'], {
    env: childEnv(),
    encoding: 'utf8',
    shell: false
  })
  const candidates = String(result.stdout ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const node = candidates.find((candidate) => !candidate.toLowerCase().includes('\\temp\\bun-node-'))

  return node ?? 'node'
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
