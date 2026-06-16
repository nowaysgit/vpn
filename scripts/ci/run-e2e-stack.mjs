#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const composeFileIndex = args.indexOf('--compose-file')
const composeFile = composeFileIndex >= 0 ? args[composeFileIndex + 1] : 'docker-compose.test.yml'
const upOnly = args.includes('--up')
const downOnly = args.includes('--down')
const ensureOnly = args.includes('--ensure-only')
const downAfter = args.includes('--down-after') || (!upOnly && !downOnly && !ensureOnly)

if (!composeFile) {
  console.error('--compose-file requires a value')
  process.exit(1)
}

if (downOnly) {
  runCompose(['-f', composeFile, 'down', '-v'])
  process.exit(0)
}

runCompose(['-f', composeFile, 'up', '-d', '--build'])

if (!upOnly && !ensureOnly) {
  run('node', ['scripts/ci/run-playwright-node.mjs'])
}

if (downAfter) runCompose(['-f', composeFile, 'down', '-v'])

function runCompose(composeArgs) {
  run('docker', ['compose', ...composeArgs])
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })

  if (result.status !== 0) process.exit(result.status ?? 1)
}
