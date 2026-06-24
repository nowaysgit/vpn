#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const nodeBin = realNodeExecutable()

const steps = [
  { name: 'lint', command: 'bun', args: ['run', 'ci:check:lint'] },
  { name: 'typecheck', command: 'bun', args: ['run', 'ci:check:types'] },
  { name: 'api-contract tests', command: 'bun', args: ['run', '--cwd', 'libs/api-contract', 'test'] },
  { name: 'provider-contract tests', command: 'bun', args: ['run', '--cwd', 'libs/provider-contract', 'test'] },
  { name: 'telegram-bot tests', command: 'bun', args: ['run', '--cwd', 'apps/telegram-bot', 'test'] },
  { name: 'provisioning-worker tests', command: 'bun', args: ['run', '--cwd', 'apps/provisioning-worker', 'test'] },
  { name: 'backend tests', command: 'bun', args: ['run', '--cwd', 'apps/backend', 'test'] },
  { name: 'customer-web tests', command: 'bun', args: ['run', '--cwd', 'apps/customer-web', 'test'] },
  { name: 'admin-web tests', command: 'bun', args: ['run', '--cwd', 'apps/admin-web', 'test'] },
  { name: 'production config preflight', command: 'bun', args: ['run', 'check:production-config'] },
  { name: 'backend production compose config', command: 'docker', args: ['compose', '-f', 'apps/backend/docker-compose.yml', 'config', '--quiet'] },
  { name: 'customer production compose config', command: 'docker', args: ['compose', '-f', 'apps/customer-web/docker-compose.yml', 'config', '--quiet'] },
  { name: 'admin production compose config', command: 'docker', args: ['compose', '-f', 'apps/admin-web/docker-compose.yml', 'config', '--quiet'] },
  { name: 'production web build', command: 'bun', args: ['run', 'build:e2e'] },
  {
    name: 'local Playwright e2e',
    command: nodeBin,
    args: ['scripts/ci/run-local-e2e.mjs'],
    env: { E2E_FORCE_CLEAN_CHILD: '1' },
    attempts: 2
  },
  { name: 'T-Bank smoke', command: 'bun', args: ['run', 'smoke:tbank'], strictExternal: true },
  { name: 'Yandex 360 DNS', command: 'bun', args: ['run', 'check:yandex360-dns'], strictExternal: true },
  { name: 'Yandex 360 SMTP send', command: 'bun', args: ['run', 'smoke:yandex360-email'], strictExternal: true },
  { name: 'Inbox placement', command: 'bun', args: ['run', 'check:email-delivery'], strictExternal: true }
]

for (const step of steps) {
  const attempts = step.attempts ?? 1
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const suffix = attempts > 1 ? ` (${attempt}/${attempts})` : ''
    console.log(`\n==> ${step.name}${suffix}`)
    const result = spawnSync(step.command, step.args, {
      cwd: process.cwd(),
      env: childEnv({
        ...step.env,
        ...(step.strictExternal ? { EXTERNAL_SMOKE_STRICT: 'true' } : {})
      }),
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })

    if (result.status === 0) break
    if (attempt < attempts) continue

    console.error(`Production readiness failed at: ${step.name}`)
    process.exit(result.status ?? 1)
  }
}

console.log('\nProduction readiness checks passed.')

function childEnv(overrides = {}) {
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
