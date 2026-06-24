import { Elysia, t } from 'elysia'
import { requireUser } from '../../services/access-control.service'
import { createSupportTicket } from './support.service'

export function createSupportRoutes() {
  return new Elysia().post(
    '/support/tickets',
    async ({ headers, body, set }) => {
      const user = await requireUser(headers.authorization)
      const ticket = await createSupportTicket(user.id, body)
      set.status = 201
      return ticket
    },
    {
      body: t.Object({
        subject: t.String({ minLength: 1 }),
        message: t.String({ minLength: 1 })
      })
    }
  )
}
