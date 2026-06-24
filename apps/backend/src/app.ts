import cors from '@elysiajs/cors'
import { Elysia } from 'elysia'
import { runSeed } from './db/seed'
import { assertProductionConfig } from './lib/config'
import { createEmailSender, type EmailSender } from './lib/email'
import { AppError } from './lib/errors'
import { createAdminRoutes } from './modules/admin/admin.routes'
import { createAuthRoutes } from './modules/auth/auth.routes'
import { createCustomerRoutes } from './modules/customer/customer.routes'
import { createHealthRoutes } from './modules/health/health.routes'
import { createPaymentsRoutes } from './modules/payments/payments.routes'
import { createPlansRoutes } from './modules/plans/plans.routes'
import { createSubscriptionsRoutes } from './modules/subscriptions/subscriptions.routes'
import { createSupportRoutes } from './modules/support/support.routes'
import { createTelegramRoutes } from './modules/telegram/telegram.routes'

type CreateAppOptions = {
  emailSender?: EmailSender
}

export async function createApp(options: CreateAppOptions = {}) {
  assertProductionConfig()
  await runSeed()
  const emailSender = options.emailSender ?? createEmailSender()

  const app = new Elysia()
    .use(cors({ origin: true, credentials: true }))
    .onError(({ error, set }) => {
      if (error instanceof AppError) {
        set.status = error.status
        return error.toBody()
      }

      if (error instanceof Error && error.message.toLowerCase().includes('payment webhook')) {
        set.status = 400
        return { code: 'VALIDATION_ERROR', message: error.message }
      }

      set.status = 500
      return { code: 'VALIDATION_ERROR', message: 'Unexpected server error' }
    })
    .use(createHealthRoutes())
    .use(createPlansRoutes())
    .use(createAuthRoutes({ emailSender }))
    .use(createCustomerRoutes())
    .use(createPaymentsRoutes())
    .use(createSubscriptionsRoutes())
    .use(createSupportRoutes())
    .use(createTelegramRoutes())
    .use(createAdminRoutes())

  return { app }
}

export type App = Awaited<ReturnType<typeof createApp>>['app']
