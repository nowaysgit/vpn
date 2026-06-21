<script setup lang="ts">
import { Copy, CreditCard, Link2, LogIn, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import type { CustomerDevice, CustomerProfile, PaymentInvoice, PublicPlan } from '@vpn/api-contract'
import { CustomerApi } from '~/lib/api'
import { dateLabel, rub } from '~/lib/format'

const config = useRuntimeConfig()
const route = useRoute()
const api = new CustomerApi(config.public.apiBaseUrl)

const email = ref('user@example.com')
const name = ref('User')
const password = ref('password123')
const authToken = ref('')
const profile = ref<CustomerProfile | null>(null)
const plans = ref<PublicPlan[]>([])
const devices = ref<CustomerDevice[]>([])
const selectedPlanId = ref('plan_starter')
const invoice = ref<PaymentInvoice | null>(null)
const telegramLinkToken = ref('')
const deviceLabel = ref('Laptop')
const replaceDeviceId = ref('')
const error = ref('')
const notice = ref('')
const loading = ref(false)

const subscriptionUrl = computed(() => {
  if (!profile.value) return ''
  const apiBase = config.public.apiBaseUrl.replace(/\/$/, '')
  return `${apiBase}${profile.value.subscriptionUrl}`
})

const replacementNeeded = computed(() => replaceDeviceId.value.length > 0)

onMounted(async () => {
  plans.value = await api.plans()
  selectedPlanId.value = plans.value[0]?.id ?? 'plan_starter'

  if (import.meta.client) {
    authToken.value = window.localStorage.getItem('vpn.customer.token') ?? ''
  }

  const token = queryValue(route.query.verificationToken)
  if (token) await verifyEmailToken(token)
  if (authToken.value) await refreshCabinet()
})

async function register() {
  await run(async () => {
    await api.register({ email: email.value, name: name.value, password: password.value })
    notice.value = 'Account created. Check your email for the verification link.'
  })
}

async function verifyEmailToken(token: string) {
  await run(async () => {
    await api.verifyEmail(token)
    if (import.meta.client) window.history.replaceState({}, document.title, window.location.pathname)
    notice.value = 'Email verified.'
  })
}

async function login() {
  await run(async () => {
    const result = await api.login({ email: email.value, password: password.value })
    authToken.value = result.token
    if (import.meta.client) window.localStorage.setItem('vpn.customer.token', result.token)
    await refreshCabinet()
  })
}

async function createPayment() {
  await run(async () => {
    invoice.value = await api.createPayment(authToken.value, selectedPlanId.value)
    notice.value = 'Payment invoice created.'
  })
}

async function sandboxPaid() {
  if (!invoice.value) return

  await run(async () => {
    if (!invoice.value) return
    await api.sandboxMarkPaid(invoice.value)
    await refreshCabinet()
    notice.value = 'Sandbox payment marked as paid.'
  })
}

async function addDevice() {
  await run(async () => {
    const result = await api.addDevice(authToken.value, deviceLabel.value)
    if ('replaceRequired' in result) {
      replaceDeviceId.value = result.devices[0]?.id ?? ''
      devices.value = result.devices
      notice.value = 'Choose a device to replace.'
      return
    }

    replaceDeviceId.value = ''
    await refreshCabinet()
  })
}

async function replaceDevice() {
  await run(async () => {
    await api.replaceDevice(authToken.value, replaceDeviceId.value, deviceLabel.value)
    replaceDeviceId.value = ''
    await refreshCabinet()
  })
}

async function removeDevice(id: string) {
  await run(async () => {
    await api.removeDevice(authToken.value, id)
    await refreshCabinet()
  })
}

async function copySubscription() {
  if (!subscriptionUrl.value || !import.meta.client) return
  await navigator.clipboard.writeText(subscriptionUrl.value)
  notice.value = 'Subscription link copied.'
}

async function createTelegramLinkToken() {
  await run(async () => {
    const result = await api.telegramLinkToken(authToken.value)
    telegramLinkToken.value = result.token
    notice.value = 'Telegram link token created.'
  })
}

async function refreshCabinet() {
  if (!authToken.value) return
  profile.value = await api.profile(authToken.value)
  devices.value = await api.devices(authToken.value)
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

function queryValue(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}
</script>

<template>
  <main class="page">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">V</span>
        <span>VPN Cabinet</span>
      </div>
      <nav class="tabs" aria-label="Customer sections">
        <span>Cabinet</span>
        <span>Devices</span>
        <span>Payments</span>
        <span>Support</span>
      </nav>
    </header>

    <div class="shell">
      <aside class="panel stack">
        <section class="stack" aria-labelledby="auth-title">
          <h1 id="auth-title" class="title">Account</h1>
          <label class="label">
            Email
            <input v-model="email" class="input" data-testid="email" autocomplete="email">
          </label>
          <label class="label">
            Name
            <input v-model="name" class="input" data-testid="name" autocomplete="name">
          </label>
          <label class="label">
            Password
            <input v-model="password" class="input" data-testid="password" type="password" autocomplete="current-password">
          </label>
          <div class="button-row">
            <button class="secondary" data-testid="register" :disabled="loading" @click="register">
              <Plus :size="16" />
              Register
            </button>
            <button class="primary" data-testid="login" :disabled="loading" @click="login">
              <LogIn :size="16" />
              Login
            </button>
          </div>
        </section>

        <section class="stack" aria-labelledby="payment-title">
          <h2 id="payment-title" class="title">Subscription</h2>
          <select v-model="selectedPlanId" class="input" data-testid="plan-select">
            <option v-for="plan in plans" :key="plan.id" :value="plan.id">
              {{ plan.title }} · {{ rub(plan.priceRub) }} · {{ plan.trafficLimitGb }} GB
            </option>
          </select>
          <button class="primary" data-testid="create-payment" :disabled="loading || !authToken" @click="createPayment">
            <CreditCard :size="16" />
            Create payment
          </button>
          <div v-if="invoice" class="card stack" data-testid="invoice">
            <strong>{{ invoice.provider }} invoice</strong>
            <span class="muted">{{ rub(invoice.amountRub) }}</span>
            <a :href="invoice.checkoutUrl" target="_blank" rel="noreferrer">{{ invoice.checkoutUrl }}</a>
            <button class="secondary" data-testid="sandbox-paid" @click="sandboxPaid">Mark paid</button>
          </div>
        </section>
      </aside>

      <section class="stack">
        <div v-if="error" class="alert" data-testid="error">{{ error }}</div>
        <div v-if="notice" class="status active" data-testid="notice">{{ notice }}</div>

        <section class="grid" aria-label="Subscription status">
          <article class="card stack">
            <span class="muted">Status</span>
            <span class="metric" data-testid="subscription-status">{{ profile?.subscriptionStatus ?? 'signed out' }}</span>
            <span :class="['status', profile?.subscriptionStatus === 'active' ? 'active' : 'warning']">
              Until {{ dateLabel(profile?.subscriptionEndsAt ?? null) }}
            </span>
          </article>
          <article class="card stack">
            <span class="muted">Traffic</span>
            <span class="metric" data-testid="traffic">{{ profile?.trafficUsedGb ?? 0 }}/{{ profile?.trafficLimitGb ?? 0 }} GB</span>
            <span class="muted">Limit is counted per user across all devices</span>
          </article>
        </section>

        <section class="panel stack" aria-labelledby="link-title">
          <h2 id="link-title" class="title">Subscription link</h2>
          <input class="input" data-testid="subscription-link" :value="subscriptionUrl" readonly>
          <div class="button-row">
            <button class="primary" data-testid="copy-subscription" :disabled="!subscriptionUrl" @click="copySubscription">
              <Copy :size="16" />
              Copy link
            </button>
            <button class="secondary" data-testid="refresh" :disabled="!authToken" @click="refreshCabinet">
              <RefreshCw :size="16" />
              Refresh
            </button>
          </div>
        </section>

        <section class="panel stack" aria-labelledby="devices-title">
          <h2 id="devices-title" class="title">Devices</h2>
          <div class="button-row">
            <input v-model="deviceLabel" class="input" data-testid="device-label" style="max-width: 280px">
            <button v-if="!replacementNeeded" class="primary" data-testid="add-device" :disabled="!authToken" @click="addDevice">
              <Plus :size="16" />
              Add device
            </button>
            <button v-else class="primary" data-testid="replace-device" :disabled="!replaceDeviceId" @click="replaceDevice">
              Replace selected
            </button>
          </div>
          <label v-if="replacementNeeded" class="label">
            Device to replace
            <select v-model="replaceDeviceId" class="input" data-testid="replace-select">
              <option v-for="device in devices" :key="device.id" :value="device.id">
                {{ device.label }}
              </option>
            </select>
          </label>
          <div class="list" data-testid="device-list">
            <div v-for="device in devices" :key="device.id" class="row">
              <div>
                <strong>{{ device.label }}</strong>
                <div class="muted">{{ device.serverName ?? 'No server yet' }} · {{ device.protocols.join(', ') }}</div>
              </div>
              <button class="secondary danger" :data-testid="`remove-${device.id}`" @click="removeDevice(device.id)">
                <Trash2 :size="16" />
              </button>
            </div>
          </div>
        </section>

        <section class="panel stack" aria-labelledby="telegram-title">
          <h2 id="telegram-title" class="title">Telegram</h2>
          <div class="button-row">
            <button class="secondary" data-testid="telegram-link-token" :disabled="!authToken" @click="createTelegramLinkToken">
              <Link2 :size="16" />
              Link Telegram
            </button>
            <input class="input" data-testid="telegram-token" :value="telegramLinkToken" readonly>
          </div>
        </section>

        <section class="panel stack" aria-labelledby="support-title">
          <h2 id="support-title" class="title">Instructions & support</h2>
          <p class="muted">
            Use the subscription link in Hiddify. The link contains VLESS REALITY, Trojan TLS and Shadowsocks profiles.
          </p>
        </section>
      </section>
    </div>
  </main>
</template>
