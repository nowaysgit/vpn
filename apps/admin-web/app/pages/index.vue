<script setup lang="ts">
import { Ban, FileClock, RefreshCw, Save, ShieldCheck } from 'lucide-vue-next'
import type { AdminAuditEntry, AdminUserListItem, PublicPlan } from '@vpn/api-contract'
import { AdminApi, type ServerRow } from '~/lib/api'
import { compactDate } from '~/lib/format'

const config = useRuntimeConfig()
const api = new AdminApi(config.public.apiBaseUrl)

const email = ref('owner@vpn.local')
const password = ref('changeme')
const token = ref('')
const users = ref<AdminUserListItem[]>([])
const plans = ref<PublicPlan[]>([])
const audit = ref<AdminAuditEntry[]>([])
const servers = ref<ServerRow[]>([])
const selectedPlanId = ref('plan_starter')
const selectedUserId = ref('')
const notes = ref('')
const error = ref('')
const notice = ref('')
const loading = ref(false)

const selectedUser = computed(() => users.value.find((user) => user.id === selectedUserId.value) ?? null)

onMounted(async () => {
  plans.value = await api.plans()
  selectedPlanId.value = plans.value[0]?.id ?? 'plan_starter'

  if (import.meta.client) token.value = window.localStorage.getItem('vpn.admin.token') ?? ''
  if (token.value) await refreshAdmin()
})

async function login() {
  await run(async () => {
    const result = await api.login(email.value, password.value)
    token.value = result.token
    if (import.meta.client) window.localStorage.setItem('vpn.admin.token', result.token)
    await refreshAdmin()
  })
}

async function refreshAdmin() {
  if (!token.value) return
  users.value = await api.users(token.value)
  audit.value = await api.audit(token.value)
  servers.value = await api.servers(token.value)
  selectedUserId.value = users.value[0]?.id ?? ''
}

async function grant() {
  if (!selectedUserId.value) return
  await run(async () => {
    await api.grant(token.value, selectedUserId.value, selectedPlanId.value)
    await refreshAdmin()
    notice.value = 'Subscription granted.'
  })
}

async function block() {
  if (!selectedUserId.value) return
  await run(async () => {
    await api.block(token.value, selectedUserId.value)
    await refreshAdmin()
    notice.value = 'User blocked.'
  })
}

async function saveNotes() {
  if (!selectedUserId.value) return
  await run(async () => {
    await api.notes(token.value, selectedUserId.value, notes.value)
    await refreshAdmin()
    notice.value = 'Notes saved.'
  })
}

async function run(action: () => Promise<void>) {
  loading.value = true
  error.value = ''
  notice.value = ''

  try {
    await action()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Unexpected error'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="page">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">A</span>
        <span>VPN Admin</span>
      </div>
      <nav class="tabs" aria-label="Admin sections">
        <span>Clients</span>
        <span>Subscriptions</span>
        <span>Payments</span>
        <span>Servers</span>
        <span>Audit</span>
      </nav>
    </header>

    <div class="shell">
      <aside class="panel stack">
        <section class="stack">
          <h1 class="title">Admin access</h1>
          <label class="label">
            Email
            <input v-model="email" class="input" data-testid="admin-email">
          </label>
          <label class="label">
            Password
            <input v-model="password" class="input" data-testid="admin-password" type="password">
          </label>
          <button class="primary" data-testid="admin-login" :disabled="loading" @click="login">
            <ShieldCheck :size="16" />
            Login
          </button>
        </section>

        <section class="stack">
          <h2 class="title">Manual operations</h2>
          <label class="label">
            Client
            <select v-model="selectedUserId" class="input" data-testid="admin-user-select">
              <option v-for="user in users" :key="user.id" :value="user.id">
                {{ user.email }}
              </option>
            </select>
          </label>
          <label class="label">
            Plan
            <select v-model="selectedPlanId" class="input" data-testid="admin-plan-select">
              <option v-for="plan in plans" :key="plan.id" :value="plan.id">
                {{ plan.title }}
              </option>
            </select>
          </label>
          <div class="button-row">
            <button class="primary" data-testid="admin-grant" :disabled="!selectedUserId" @click="grant">Grant</button>
            <button class="danger" data-testid="admin-block" :disabled="!selectedUserId" @click="block">
              <Ban :size="16" />
              Block
            </button>
          </div>
          <label class="label">
            Client notes
            <textarea v-model="notes" class="input" rows="4" data-testid="admin-notes" />
          </label>
          <button class="secondary" data-testid="admin-save-notes" :disabled="!selectedUserId" @click="saveNotes">
            <Save :size="16" />
            Save notes
          </button>
        </section>
      </aside>

      <section class="stack">
        <div v-if="error" class="alert" data-testid="admin-error">{{ error }}</div>
        <div v-if="notice" class="status active" data-testid="admin-notice">{{ notice }}</div>

        <section class="grid">
          <article class="card stack">
            <span class="muted">Clients</span>
            <span class="metric">{{ users.length }}</span>
          </article>
          <article class="card stack">
            <span class="muted">Servers</span>
            <span class="metric">{{ servers.length }}</span>
          </article>
          <article class="card stack">
            <span class="muted">Selected</span>
            <span class="metric">{{ selectedUser?.subscriptionStatus ?? 'none' }}</span>
          </article>
        </section>

        <section class="panel stack">
          <div class="button-row">
            <h2 class="title">Clients</h2>
            <button class="secondary" data-testid="admin-refresh" :disabled="!token" @click="refreshAdmin">
              <RefreshCw :size="16" />
              Refresh
            </button>
          </div>
          <table class="table" data-testid="admin-users">
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Ends</th>
                <th>Traffic</th>
                <th>Devices</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.id" @click="selectedUserId = user.id">
                <td>{{ user.email }}</td>
                <td>
                  <span :class="['status', user.subscriptionStatus === 'active' ? 'active' : 'warning']">
                    {{ user.subscriptionStatus }}
                  </span>
                </td>
                <td>{{ compactDate(user.subscriptionEndsAt) }}</td>
                <td>{{ user.trafficUsedGb }}/{{ user.trafficLimitGb }} GB</td>
                <td>{{ user.deviceCount }}</td>
                <td>{{ user.notes ?? 'none' }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel stack">
          <h2 class="title">Servers</h2>
          <table class="table" data-testid="admin-servers">
            <thead>
              <tr>
                <th>Name</th>
                <th>Provider</th>
                <th>Location</th>
                <th>Protocols</th>
                <th>User visible</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="server in servers" :key="server.id">
                <td>{{ server.name }}</td>
                <td>{{ server.provider }}</td>
                <td>{{ server.locationCode }}</td>
                <td>{{ server.protocols.join(', ') }}</td>
                <td>{{ server.visibleToCustomer ? 'yes' : 'no' }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel stack">
          <h2 class="title">
            <FileClock :size="18" />
            Audit log
          </h2>
          <table class="table" data-testid="admin-audit">
            <thead>
              <tr>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in audit" :key="entry.id">
                <td>{{ entry.actorEmail }}</td>
                <td>{{ entry.action }}</td>
                <td>{{ entry.targetType }}: {{ entry.targetId }}</td>
                <td>{{ compactDate(entry.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </section>
    </div>
  </main>
</template>
