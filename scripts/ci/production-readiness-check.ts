#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'

const steps: Array<{ name: string; args: string[]; strictExternal?: boolean }> = [
  { name: 'local CI', args: ['run', 'ci:check'] },
  { name: 'T-Bank smoke', args: ['run', 'smoke:tbank'], strictExternal: true },
  { name: 'Yandex 360 DNS', args: ['run', 'check:yandex360-dns'], strictExternal: true },
  { name: 'Yandex 360 SMTP send', args: ['run', 'smoke:yandex360-email'], strictExternal: true },
  { name: 'Inbox placement', args: ['run', 'check:email-delivery'], strictExternal: true }
]

for (const step of steps) {
  console.log(`\n==> ${step.name}`)
  const result = spawnSync('bun', step.args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(step.strictExternal ? { EXTERNAL_SMOKE_STRICT: 'true' } : {})
    },
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })

  if (result.status !== 0) {
    console.error(`Production readiness failed at: ${step.name}`)
    process.exit(result.status ?? 1)
  }
}

console.log('\nProduction readiness checks passed.')
