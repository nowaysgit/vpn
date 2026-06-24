import { Elysia, t } from 'elysia'
import { requireAdmin } from '../../services/access-control.service'
import { blockUser, grantUserSubscription, listAdminAudit, listAdminServers, listAdminUsers, updateUserNotes } from './admin.service'

export function createAdminRoutes() {
  return new Elysia()
    .get('/admin/users', async ({ headers }) => {
      await requireAdmin(headers.authorization)
      return listAdminUsers()
    })
    .post(
      '/admin/users/:id/grant',
      async ({ headers, params, body }) => {
        const admin = await requireAdmin(headers.authorization)
        return grantUserSubscription(admin, params.id, body.planId)
      },
      {
        body: t.Object({
          planId: t.String()
        })
      }
    )
    .post('/admin/users/:id/block', async ({ headers, params }) => {
      const admin = await requireAdmin(headers.authorization)
      return blockUser(admin, params.id)
    })
    .post(
      '/admin/users/:id/notes',
      async ({ headers, params, body }) => {
        const admin = await requireAdmin(headers.authorization)
        return updateUserNotes(admin, params.id, body.notes)
      },
      {
        body: t.Object({
          notes: t.String()
        })
      }
    )
    .get('/admin/audit', async ({ headers }) => {
      await requireAdmin(headers.authorization)
      return listAdminAudit()
    })
    .get('/admin/servers', async ({ headers }) => {
      await requireAdmin(headers.authorization)
      return listAdminServers()
    })
}
