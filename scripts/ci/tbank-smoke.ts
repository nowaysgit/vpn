#!/usr/bin/env bun
import { TBankPaymentAdapter } from '../../apps/backend/src/lib/payments'

const terminalKey = process.env.TBANK_TERMINAL_KEY
const password = process.env.TBANK_PASSWORD
const strict = process.env.EXTERNAL_SMOKE_STRICT === 'true'

if (!terminalKey || !password) {
  const message = 'T-Bank smoke skipped: TBANK_TERMINAL_KEY and TBANK_PASSWORD are required.'
  if (strict) {
    console.error(message)
    process.exit(1)
  }

  console.log(message)
  process.exit(0)
}

const amountRub = Number(process.env.TBANK_SMOKE_AMOUNT_RUB ?? 10)
const email = process.env.TBANK_SMOKE_EMAIL ?? 'smoke@example.com'
const adapter = new TBankPaymentAdapter()
const invoice = await adapter.createInvoice({
  userId: 'smoke-user',
  planId: 'smoke-plan',
  amountRub,
  idempotencyKey: `smoke-${Date.now()}`,
  email
})

console.log(JSON.stringify(invoice, null, 2))
