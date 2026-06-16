#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dockerfile = join(process.cwd(), 'apps', 'backend', 'Dockerfile')

if (!existsSync(dockerfile)) {
  console.log('apps/backend/Dockerfile is not present yet; skipping backend docker workspace check.')
  process.exit(0)
}

const content = readFileSync(dockerfile, 'utf8')
const requiredCopies = ['package.json', 'bun.lock', 'apps/backend', 'libs/api-contract', 'libs/provider-contract']
const missing = requiredCopies.filter((item) => !content.includes(item))

if (missing.length > 0) {
  console.error(`Backend Dockerfile is missing workspace COPY references: ${missing.join(', ')}`)
  process.exit(1)
}

console.log('Backend Dockerfile workspace COPY references look good.')
