import { Elysia, t } from 'elysia'
import { requireUser } from '../../services/access-control.service'
import {
  addCustomerDevice,
  customerProfile,
  deleteCustomerDevice,
  listCustomerDevices,
  replaceCustomerDevice,
  rotateCustomerDevice
} from './customer.service'

export function createCustomerRoutes() {
  return new Elysia()
    .get('/me/profile', async ({ headers }) => customerProfile(await requireUser(headers.authorization)))
    .get('/me/devices', async ({ headers }) => {
      const user = await requireUser(headers.authorization)
      return listCustomerDevices(user)
    })
    .post(
      '/me/devices',
      async ({ headers, body, set }) => {
        const user = await requireUser(headers.authorization)
        const result = await addCustomerDevice(user, body.label)
        if (result.status !== 200) set.status = result.status
        return result.body
      },
      {
        body: t.Object({
          label: t.String({ minLength: 1 })
        })
      }
    )
    .post(
      '/me/devices/replace',
      async ({ headers, body }) => {
        const user = await requireUser(headers.authorization)
        return replaceCustomerDevice(user, body.replaceDeviceId, body.label)
      },
      {
        body: t.Object({
          replaceDeviceId: t.String(),
          label: t.String({ minLength: 1 })
        })
      }
    )
    .delete('/me/devices/:id', async ({ headers, params }) => {
      const user = await requireUser(headers.authorization)
      await deleteCustomerDevice(user, params.id)
      return { ok: true }
    })
    .post('/me/devices/:id/rotate', async ({ headers, params }) => {
      const user = await requireUser(headers.authorization)
      return rotateCustomerDevice(user, params.id)
    })
}
