#!/usr/bin/env bun
import { assertProductionConfig } from '../../apps/backend/src/lib/config'

const envFile = envFileArg(process.argv.slice(2))
const originalEnv = { ...process.env }

try {
  if (envFile) Object.assign(process.env, await parseEnvFile(envFile))
  process.env.NODE_ENV = 'production'
  assertProductionConfig()
  console.log(`Production configuration preflight passed${envFile ? ` for ${envFile}` : ''}.`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  restoreEnv(originalEnv)
}

function envFileArg(args: string[]): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--env-file') return args[index + 1] ?? null
    if (arg?.startsWith('--env-file=')) return arg.slice('--env-file='.length)
  }

  return null
}

async function parseEnvFile(path: string): Promise<Record<string, string>> {
  const file = Bun.file(path)
  if (!(await file.exists())) throw new Error(`Production env file was not found: ${path}`)

  const values: Record<string, string> = {}
  const lines = (await file.text()).split(/\r?\n/)

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const normalized = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed
    const separator = normalized.indexOf('=')
    if (separator <= 0) throw new Error(`Invalid env line ${index + 1} in ${path}`)

    const key = normalized.slice(0, separator).trim()
    const value = normalized.slice(separator + 1).trim()
    if (!/^[A-Z0-9_]+$/.test(key)) throw new Error(`Invalid env key ${key} on line ${index + 1} in ${path}`)
    values[key] = unquoteEnvValue(value)
  }

  return values
}

function unquoteEnvValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replaceAll('\\"', '"').replaceAll('\\n', '\n')
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1)
  return value
}

function restoreEnv(snapshot: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) delete process.env[key]
  }
  for (const [key, value] of Object.entries(snapshot)) {
    process.env[key] = value
  }
}
