import { Elysia, t } from 'elysia'
import type { EmailSender } from '../../lib/email'
import { loginUser, registerUser, resendVerificationEmail, verifyEmail } from './auth.service'

type AuthRouteDeps = {
  emailSender: EmailSender
}

export function createAuthRoutes({ emailSender }: AuthRouteDeps) {
  return new Elysia()
    .post(
      '/auth/register',
      async ({ body, set }) => {
        const result = await registerUser(emailSender, body)
        set.status = result.status
        return result.body
      },
      {
        body: t.Object({
          email: t.String({ format: 'email' }),
          name: t.String({ minLength: 1 }),
          password: t.String({ minLength: 8 })
        })
      }
    )
    .post(
      '/auth/register/resend',
      async ({ body, set }) => {
        const result = await resendVerificationEmail(emailSender, body.email)
        set.status = result.status
        return result.body
      },
      {
        body: t.Object({
          email: t.String({ format: 'email' })
        })
      }
    )
    .post(
      '/auth/verify-email',
      async ({ body }) => verifyEmail(body.email, body.code),
      {
        body: t.Object({
          email: t.String({ format: 'email' }),
          code: t.String({ minLength: 6, maxLength: 6 })
        })
      }
    )
    .post(
      '/auth/login',
      ({ body }) => loginUser(body.email, body.password),
      {
        body: t.Object({
          email: t.String({ format: 'email' }),
          password: t.String()
        })
      }
    )
}
