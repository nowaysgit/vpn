import { PgBoss } from 'pg-boss'
import { handleProvisioningJob } from './handlers'
import { provisioningQueues, type ProvisioningJobPayload } from './jobs'
import type { VpnProviderAdapter } from '@vpn/provider-contract'
import { WorkerMarzbanProvider } from './marzban-provider'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.log('DATABASE_URL is not set; provisioning worker is idle.')
} else {
  const boss = new PgBoss({
    connectionString,
    schema: process.env.PG_BOSS_SCHEMA ?? 'pgboss'
  })
  const provider = providerFromEnv()

  await boss.start()
  await Promise.all(
    Object.values(provisioningQueues).map((queue) =>
      boss.work<ProvisioningJobPayload>(queue, async (jobs) => {
        for (const job of jobs) {
          await handleProvisioningJob({
            queue,
            payload: job.data,
            provider
          })
        }
      })
    )
  )

  console.log('vpn provisioning worker started')
}

function providerFromEnv(): VpnProviderAdapter {
  if (process.env.MARZBAN_BASE_URL && process.env.MARZBAN_USERNAME && process.env.MARZBAN_PASSWORD) {
    return new WorkerMarzbanProvider({
      baseUrl: process.env.MARZBAN_BASE_URL,
      username: process.env.MARZBAN_USERNAME,
      password: process.env.MARZBAN_PASSWORD
    })
  }

  return idleProvider()
}

function idleProvider(): VpnProviderAdapter {
  return {
    id: 'idle',
    async health() {
      return {
        ok: true,
        provider: 'idle',
        checkedAt: new Date(),
        message: 'Worker booted; backend owns concrete provider adapters'
      }
    },
    async provision() {
      return []
    },
    async revoke(_input) {
      return
    },
    async rotate() {
      return []
    },
    async syncUsage() {
      return []
    }
  }
}
