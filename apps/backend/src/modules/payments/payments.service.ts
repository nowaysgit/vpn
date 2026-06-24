import type { PaymentProvider } from '@vpn/api-contract'
import type { Payment, User } from '../../lib/domain'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { paymentEvents, payments, plans } from '../../db/schema'
import { AppError } from '../../lib/errors'
import { createToken, createId } from '../../lib/id'
import { PlategaPaymentAdapter, TBankPaymentAdapter, paymentToInvoice, type CreateInvoiceInput } from '../../lib/payments'
import { now } from '../../lib/time'
import { requireEntity } from '../../services/entity.service'
import { grantSubscription } from '../subscriptions/subscriptions.service'

const tbank = new TBankPaymentAdapter()
const platega = new PlategaPaymentAdapter()

type CreatePaymentInvoiceInput = {
  planId: string
  provider?: Exclude<PaymentProvider, 'manual'>
  idempotencyKey?: string
}

export async function createPaymentInvoice(user: User, input: CreatePaymentInvoiceInput) {
  if (!user.emailVerified) throw new AppError('EMAIL_NOT_VERIFIED', 'Verify email before payment', 403)
  const plan = requireEntity(
    (
      await db
        .select()
        .from(plans)
        .where(eq(plans.id, input.planId))
        .limit(1)
    )[0],
    'Plan not found'
  )
  const idempotencyKey = input.idempotencyKey ?? createToken('idem')
  const [existing] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.userId, user.id), eq(payments.idempotencyKey, idempotencyKey)))
    .limit(1)
  if (existing) return paymentToInvoice(existing)

  const invoice = await createInvoiceWithFallback(input.provider, {
    userId: user.id,
    planId: plan.id,
    amountRub: plan.priceRub,
    idempotencyKey,
    email: user.email
  })
  const payment: Payment = {
    id: invoice.id,
    userId: user.id,
    planId: plan.id,
    provider: invoice.provider,
    providerPaymentId: invoice.id,
    status: invoice.status,
    amountRub: invoice.amountRub,
    checkoutUrl: invoice.checkoutUrl,
    idempotencyKey,
    createdAt: now(),
    paidAt: null
  }
  await db.insert(payments).values(payment)

  return paymentToInvoice(payment)
}

export async function processPaymentWebhook(
  provider: Exclude<PaymentProvider, 'manual'>,
  payload: unknown,
  signature?: string
) {
  const adapter = paymentAdapter(provider)
  const parsed = adapter.parseWebhook(payload, signature)

  return db.transaction(async (tx) => {
    const payment = requireEntity(
      (
        await tx
          .select()
          .from(payments)
          .where(and(eq(payments.provider, provider), eq(payments.providerPaymentId, parsed.providerPaymentId)))
          .limit(1)
      )[0],
      'Payment not found'
    )
    const [duplicate] = await tx
      .select()
      .from(paymentEvents)
      .where(and(eq(paymentEvents.provider, provider), eq(paymentEvents.providerEventId, parsed.providerEventId)))
      .limit(1)
    const duplicateEvent = Boolean(duplicate)

    if (!duplicateEvent) {
      await tx.insert(paymentEvents).values({
        id: createId('pevt'),
        paymentId: payment.id,
        provider,
        providerEventId: parsed.providerEventId,
        status: parsed.status,
        rawPayload: parsed.rawPayload,
        createdAt: now()
      })
    }

    let updatedPayment: Payment = payment
    if (parsed.status === 'paid' && payment.status !== 'paid') {
      updatedPayment = {
        ...payment,
        status: 'paid',
        paidAt: now()
      }
      await tx
        .update(payments)
        .set({ status: updatedPayment.status, paidAt: updatedPayment.paidAt })
        .where(eq(payments.id, payment.id))
      const plan = requireEntity(
        (
          await tx
            .select()
            .from(plans)
            .where(eq(plans.id, payment.planId))
            .limit(1)
        )[0],
        'Plan not found'
      )
      await grantSubscription(payment.userId, plan, null, tx)
    } else if (parsed.status !== 'paid' && parsed.status !== payment.status) {
      updatedPayment = {
        ...payment,
        status: parsed.status
      }
      await tx
        .update(payments)
        .set({ status: parsed.status })
        .where(eq(payments.id, payment.id))
    }

    return {
      ok: true,
      duplicate: duplicateEvent,
      payment: paymentToInvoice(updatedPayment)
    }
  })
}

export function paymentSignature(headers: Record<string, string | undefined>): string | undefined {
  return headers['x-signature'] ?? headers['x-payment-signature'] ?? headers['x-platega-signature'] ?? headers['x-tbank-signature']
}

async function createInvoiceWithFallback(provider: Exclude<PaymentProvider, 'manual'> | undefined, input: CreateInvoiceInput) {
  const primary = paymentAdapter(provider ?? 'tbank')

  try {
    return await primary.createInvoice(input)
  } catch (error) {
    if (provider || primary.id !== 'tbank') throw error
    return platega.createInvoice(input)
  }
}

function paymentAdapter(provider: PaymentProvider) {
  if (provider === 'tbank') return tbank
  if (provider === 'manual') throw new AppError('PAYMENT_PROVIDER_ERROR', 'Manual provider cannot create invoices', 400)
  return platega
}
