import { spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const binName = process.platform === 'win32' ? 'playwright.exe' : 'playwright'
const playwrightBin = join(process.cwd(), 'node_modules', '.bin', binName)
const outputDir = join(process.cwd(), 'output')
const logPath = join(outputDir, 'playwright-run.log')

if (!existsSync(playwrightBin)) {
  console.error(`Playwright binary was not found at ${playwrightBin}`)
  process.exit(1)
}

mkdirSync(outputDir, { recursive: true })
const logFd = openSync(logPath, 'w')

const child = spawn(playwrightBin, ['test', ...args], {
  cwd: process.cwd(),
  env: childEnv(),
  stdio: ['ignore', logFd, logFd],
  shell: false
})

child.on('exit', (code) => {
  closeSync(logFd)
  printLog(code ?? 1)
  process.exit(code ?? 1)
})

child.on('error', (error) => {
  closeSync(logFd)
  console.error(error)
  process.exit(1)
})

function printLog(code) {
  const log = readFileSync(logPath, 'utf8').trimEnd()
  if (!log) return

  const lines = log.split(/\r?\n/)
  const visible = code === 0 ? lines : lines.slice(-160)
  console.log(visible.join('\n'))
}

function childEnv() {
  const env = { ...process.env }

  for (const key of Object.keys(env)) {
    if (key.toLowerCase().startsWith('npm_')) delete env[key]
    if (key.startsWith('BUN_')) delete env[key]
  }

  delete env.INIT_CWD

  return env
}
