#!/usr/bin/env bun
import { resolveCname, resolveMx, resolveTxt } from 'node:dns/promises'

const domain = process.env.EMAIL_DOMAIN ?? domainFromEmail(process.env.EMAIL_FROM)
const strict = process.env.EXTERNAL_SMOKE_STRICT === 'true'

if (!domain) {
  const message = 'Yandex 360 DNS check skipped: set EMAIL_DOMAIN or EMAIL_FROM.'
  if (strict) {
    console.error(message)
    process.exit(1)
  }

  console.log(message)
  process.exit(0)
}

const dkimSelector = process.env.EMAIL_DKIM_SELECTOR ?? 'mail'
const expectedSpfInclude = process.env.EMAIL_EXPECTED_SPF_INCLUDE ?? '_spf.yandex.net'
const expectedMx = process.env.EMAIL_EXPECTED_MX ?? 'mx.yandex.net'
const failures: string[] = []

console.log(`Checking Yandex 360 DNS records for ${domain}`)

const spfRecords = await txt(domain)
const spf = spfRecords.filter((record) => record.toLowerCase().startsWith('v=spf1'))
if (spf.length !== 1) {
  failures.push(`Expected exactly one SPF TXT record at ${domain}, found ${spf.length}.`)
} else if (!spf[0]?.includes(expectedSpfInclude)) {
  failures.push(`SPF record must include ${expectedSpfInclude}: ${spf[0]}`)
} else {
  console.log(`SPF OK: ${spf[0]}`)
}

const dkimHost = `${dkimSelector}._domainkey.${domain}`
const dkimRecords = await txt(dkimHost)
const dkimCnames = await cname(dkimHost)
if (!hasDkimRecord(dkimRecords) && dkimCnames.length === 0) {
  failures.push(`DKIM record is missing at ${dkimHost}.`)
} else {
  const proof = dkimRecords.find((record) => record.toLowerCase().startsWith('v=dkim1')) ?? dkimCnames.join(', ')
  console.log(`DKIM OK: ${dkimHost} -> ${proof}`)
}

const dmarcHost = `_dmarc.${domain}`
const dmarcRecords = await txt(dmarcHost)
const dmarc = dmarcRecords.filter((record) => record.toLowerCase().startsWith('v=dmarc1'))
if (dmarc.length !== 1) {
  failures.push(`Expected exactly one DMARC TXT record at ${dmarcHost}, found ${dmarc.length}.`)
} else if (!/;\s*p=(none|quarantine|reject)\b/i.test(dmarc[0] ?? '')) {
  failures.push(`DMARC record must set p=none, p=quarantine, or p=reject: ${dmarc[0]}`)
} else {
  console.log(`DMARC OK: ${dmarc[0]}`)
}

const mx = await mxRecords(domain)
if (mx.length === 0) {
  failures.push(`MX records are missing for ${domain}.`)
} else if (!mx.some((record) => record.exchange.toLowerCase().replace(/\.$/, '') === expectedMx)) {
  failures.push(`Expected an MX record pointing to ${expectedMx}, found: ${mx.map((record) => record.exchange).join(', ')}`)
} else {
  console.log(`MX OK: ${mx.map((record) => `${record.priority} ${record.exchange}`).join(', ')}`)
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`DNS check failed: ${failure}`)
  process.exit(1)
}

console.log('Yandex 360 DNS check passed.')

async function txt(host: string): Promise<string[]> {
  try {
    return (await resolveTxt(host)).map((parts) => parts.join(''))
  } catch {
    return []
  }
}

async function cname(host: string): Promise<string[]> {
  try {
    return await resolveCname(host)
  } catch {
    return []
  }
}

async function mxRecords(host: string): Promise<Array<{ exchange: string; priority: number }>> {
  try {
    return await resolveMx(host)
  } catch {
    return []
  }
}

function hasDkimRecord(records: string[]): boolean {
  return records.some((record) => {
    const lower = record.toLowerCase()
    return lower.startsWith('v=dkim1') || lower.includes('k=rsa') || lower.includes('p=')
  })
}

function domainFromEmail(email: string | undefined): string | null {
  const match = email?.match(/@([^<>\s]+)>?$/)
  return match?.[1]?.toLowerCase() ?? null
}
