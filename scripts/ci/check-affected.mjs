#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const mode = process.argv.includes('--fix') ? 'ci:fix' : 'ci:check'

const git = spawnSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' })
const changed = git.status === 0 ? git.stdout.split(/\r?\n/).filter(Boolean) : []
const packageDirs = discoverPackages()
const affected = new Set()

for (const file of changed) {
  const normalized = file.replaceAll('\\', '/')
  const owner = packageDirs.find((pkg) => normalized === pkg || normalized.startsWith(`${pkg}/`))

  if (owner) affected.add(owner)

  if (
    normalized === 'package.json' ||
    normalized === 'bun.lock' ||
    normalized.startsWith('scripts/ci/') ||
    normalized.startsWith('.github/') ||
    normalized.includes('Dockerfile') ||
    normalized.includes('docker-compose')
  ) {
    for (const pkg of packageDirs) affected.add(pkg)
  }
}

if (affected.size === 0) {
  for (const pkg of packageDirs) affected.add(pkg)
}

for (const pkg of affected) {
  const result = spawnSync('bun', ['run', '--cwd', pkg, mode], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })

  if (result.status !== 0) process.exit(result.status ?? 1)
}

function discoverPackages() {
  const dirs = []

  for (const base of ['apps', 'libs']) {
    const full = join(root, base)
    if (!existsSync(full)) continue

    for (const name of readdirSync(full)) {
      const pkgDir = join(full, name)
      const manifest = join(pkgDir, 'package.json')
      if (!existsSync(manifest)) continue

      const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
      if (typeof parsed.name === 'string') dirs.push(relative(root, dirname(manifest)).replaceAll('\\', '/'))
    }
  }

  return dirs
}
