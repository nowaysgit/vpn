#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const rootPackage = readJson(join(root, 'package.json'))
const workspacePatterns = Array.isArray(rootPackage.workspaces) ? rootPackage.workspaces : []
const workspaces = workspacePatterns
  .flatMap((pattern) => expandWorkspacePattern(pattern))
  .filter((workspacePath) => {
    const packageJsonPath = join(root, workspacePath, 'package.json')
    if (!existsSync(packageJsonPath)) return false

    const packageJson = readJson(packageJsonPath)
    return typeof packageJson.scripts?.typecheck === 'string'
  })
  .sort(compareWorkspaces)

if (workspaces.length === 0) {
  console.log('No workspace typecheck scripts found.')
  process.exit(0)
}

for (const workspacePath of workspaces) {
  console.log(`\n==> ${workspacePath} typecheck`)
  const result = spawnSync('bun', ['run', '--cwd', workspacePath, 'typecheck'], {
    cwd: root,
    env: childEnv(),
    stdio: 'inherit',
    shell: false
  })

  if (result.status !== 0) {
    console.error(`Workspace typecheck failed: ${workspacePath}`)
    process.exit(result.status ?? 1)
  }
}

console.log('\nWorkspace typechecks passed.')

function expandWorkspacePattern(pattern) {
  if (typeof pattern !== 'string') return []
  if (!pattern.endsWith('/*')) return existsSync(join(root, pattern, 'package.json')) ? [toPosix(pattern)] : []

  const parent = pattern.slice(0, -2)
  const parentPath = join(root, parent)
  if (!existsSync(parentPath)) return []

  return readdirSync(parentPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => toPosix(relative(root, join(parentPath, entry.name))))
}

function compareWorkspaces(a, b) {
  return workspaceRank(a) - workspaceRank(b) || a.localeCompare(b)
}

function workspaceRank(workspacePath) {
  if (workspacePath.startsWith('libs/')) return 0
  if (workspacePath.startsWith('apps/')) return 1

  return 2
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function childEnv() {
  const env = { ...process.env }

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

function toPosix(path) {
  return path.replaceAll('\\', '/')
}
