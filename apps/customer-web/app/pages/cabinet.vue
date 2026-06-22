<script setup lang="ts">
import { CheckIcon, CopyIcon, CreditCardIcon, Link2Icon, LogInIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from '@lucide/vue'
import type { CustomerDevice, CustomerProfile, PaymentInvoice, PublicPlan } from '@vpn/api-contract'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { CustomerApi } from '~/lib/api'
import { dateLabel, rub } from '~/lib/format'
import CabinetHeader from '@/components/cabinet/CabinetHeader.vue'

const config = useRuntimeConfig()
const api = new CustomerApi(config.public.apiBaseUrl)

const email = ref('user@example.com')
const name = ref('User')
const password = ref('password123')
const passwordConfirm = ref('password123')
const verificationCode = ref('')
const verificationStep = ref(false)
const resendAvailableAt = ref('')
const resendNow = ref(Date.now())
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

  if (import.meta.client) authToken.value = window.localStorage.getItem('vpn.customer.token') ?? ''
  if (authToken.value) await refreshCabinet()
})

let resendTimer: ReturnType<typeof setTimeout> | undefined

watch(resendAvailableAt, scheduleResendUnlock)
onBeforeUnmount(() => {
  if (resendTimer) clearTimeout(resendTimer)
})

async function register() {
  await run(async () => {
    if (password.value !== passwordConfirm.value) throw new Error('Passwords do not match')
    const result = await api.register({ email: email.value, name: name.value, password: password.value })
    email.value = result.email
    resendAvailableAt.value = result.resendAvailableAt
    verificationStep.value = true
    notice.value = 'Account created. Check your email for the verification code.'
  })
}

async function resendRegistration() {
  await run(async () => {
    const result = await api.resendRegistration(email.value)
    resendAvailableAt.value = result.resendAvailableAt
    notice.value = 'Verification code sent.'
  })
}

async function verifyEmailCode() {
  await run(async () => {
    await api.verifyEmail(email.value, verificationCode.value)
    verificationCode.value = ''
    verificationStep.value = false
    notice.value = 'Email verified. You can sign in with your password.'
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
    await api.sandboxMarkPaid(invoice.value!)
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

const resendLocked = computed(() => {
  if (!resendAvailableAt.value) return false
  return new Date(resendAvailableAt.value).getTime() > resendNow.value
})

function scheduleResendUnlock() {
  if (resendTimer) clearTimeout(resendTimer)
  resendNow.value = Date.now()
  const unlockAt = resendAvailableAt.value ? new Date(resendAvailableAt.value).getTime() : 0
  const delay = Math.max(0, unlockAt - resendNow.value)
  if (delay > 0) {
    resendTimer = setTimeout(() => {
      resendNow.value = Date.now()
    }, delay + 100)
  }
}
</script>

<template>
  <main class="min-h-screen bg-muted/30">
    <CabinetHeader />
    <div class="mx-auto grid w-[min(1400px,calc(100%-2rem))] gap-6 py-6 xl:grid-cols-[360px_1fr]">
      <aside class="flex flex-col gap-6">
        <Card id="account">
          <CardHeader><CardTitle>Аккаунт</CardTitle><CardDescription>Войдите или создайте доступ.</CardDescription></CardHeader>
          <CardContent>
            <FieldGroup v-if="verificationStep">
              <Field><FieldLabel for="email">Email</FieldLabel><Input id="email" v-model="email" data-testid="email" autocomplete="email" disabled /></Field>
              <Field><FieldLabel for="verification-code">Код из письма</FieldLabel><Input id="verification-code" v-model="verificationCode" data-testid="verification-code" inputmode="numeric" autocomplete="one-time-code" /></Field>
              <div class="flex flex-wrap gap-2">
                <Button data-testid="back-to-register" :disabled="loading" variant="outline" @click="verificationStep = false">Назад</Button>
                <Button data-testid="resend-registration" :disabled="loading || resendLocked" variant="outline" @click="resendRegistration"><RefreshCwIcon data-icon="inline-start" />Отправить ещё раз</Button>
                <Button data-testid="verify-email" :disabled="loading || !verificationCode" @click="verifyEmailCode"><CheckIcon data-icon="inline-start" />Подтвердить email</Button>
              </div>
            </FieldGroup>
            <FieldGroup v-else>
              <Field><FieldLabel for="email">Email</FieldLabel><Input id="email" v-model="email" data-testid="email" autocomplete="email" /></Field>
              <Field><FieldLabel for="name">Имя</FieldLabel><Input id="name" v-model="name" data-testid="name" autocomplete="name" /></Field>
              <Field><FieldLabel for="password">Пароль</FieldLabel><Input id="password" v-model="password" data-testid="password" type="password" autocomplete="new-password" /></Field>
              <Field><FieldLabel for="password-confirm">Повтор пароля</FieldLabel><Input id="password-confirm" v-model="passwordConfirm" data-testid="password-confirm" type="password" autocomplete="new-password" /></Field>
              <div class="flex flex-wrap gap-2"><Button data-testid="register" :disabled="loading" variant="outline" @click="register"><PlusIcon data-icon="inline-start" />Регистрация</Button><Button data-testid="login" :disabled="loading" @click="login"><LogInIcon data-icon="inline-start" />Войти</Button></div>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card id="subscription">
          <CardHeader><CardTitle>Подписка</CardTitle><CardDescription>Выберите тариф и создайте счёт.</CardDescription></CardHeader>
          <CardContent class="flex flex-col gap-4">
            <Select v-model="selectedPlanId"><SelectTrigger class="w-full" data-testid="plan-select"><SelectValue placeholder="Выберите тариф" /></SelectTrigger><SelectContent><SelectGroup><SelectItem v-for="plan in plans" :key="plan.id" :value="plan.id">{{ plan.title }} · {{ rub(plan.priceRub) }} · {{ plan.trafficLimitGb }} GB</SelectItem></SelectGroup></SelectContent></Select>
            <Button data-testid="create-payment" :disabled="loading || !authToken" @click="createPayment"><CreditCardIcon data-icon="inline-start" />Создать счёт</Button>
            <Card v-if="invoice" size="sm" data-testid="invoice"><CardHeader><CardTitle class="text-base">Счёт {{ invoice.provider }}</CardTitle><CardDescription>{{ rub(invoice.amountRub) }}</CardDescription></CardHeader><CardContent><NuxtLink class="break-all text-sm text-foreground underline" :to="invoice.checkoutUrl" external target="_blank" rel="noreferrer">{{ invoice.checkoutUrl }}</NuxtLink></CardContent><CardFooter><Button data-testid="sandbox-paid" variant="outline" @click="sandboxPaid">Отметить оплаченным</Button></CardFooter></Card>
          </CardContent>
        </Card>
      </aside>

      <section class="flex min-w-0 flex-col gap-6">
        <Alert v-if="error" variant="destructive" data-testid="error"><AlertTitle>Не удалось выполнить действие</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>
        <Alert v-if="notice" data-testid="notice"><AlertTitle>Готово</AlertTitle><AlertDescription>{{ notice }}</AlertDescription></Alert>

        <div class="grid gap-4 md:grid-cols-2">
          <Card><CardHeader><CardDescription>Статус</CardDescription><CardTitle class="text-3xl" data-testid="subscription-status">{{ profile?.subscriptionStatus ?? 'signed out' }}</CardTitle></CardHeader><CardContent><Badge :variant="profile?.subscriptionStatus === 'active' ? 'default' : 'secondary'">До {{ dateLabel(profile?.subscriptionEndsAt ?? null) }}</Badge></CardContent></Card>
          <Card><CardHeader><CardDescription>Трафик</CardDescription><CardTitle class="text-3xl" data-testid="traffic">{{ profile?.trafficUsedGb ?? 0 }}/{{ profile?.trafficLimitGb ?? 0 }} GB</CardTitle></CardHeader><CardContent class="text-sm text-muted-foreground">Лимит считается для всех устройств пользователя.</CardContent></Card>
        </div>

        <Card id="devices">
          <CardHeader><CardTitle>Ссылка для подключения</CardTitle><CardDescription>Добавьте её в Hiddify, чтобы получить VLESS REALITY, Trojan TLS и Shadowsocks.</CardDescription></CardHeader>
          <CardContent class="flex flex-col gap-3 sm:flex-row"><Input data-testid="subscription-link" :model-value="subscriptionUrl" readonly /><Button data-testid="copy-subscription" :disabled="!subscriptionUrl" @click="copySubscription"><CopyIcon data-icon="inline-start" />Копировать</Button><Button data-testid="refresh" variant="outline" :disabled="!authToken" @click="refreshCabinet"><RefreshCwIcon data-icon="inline-start" />Обновить</Button></CardContent>
        </Card>

        <Card id="telegram">
          <CardHeader><CardTitle>Устройства</CardTitle><CardDescription>Добавляйте и заменяйте устройства в пределах тарифа.</CardDescription></CardHeader>
          <CardContent class="flex flex-col gap-5">
            <div class="flex flex-col gap-3 sm:flex-row"><Input v-model="deviceLabel" data-testid="device-label" class="sm:max-w-xs" /><Button v-if="!replacementNeeded" data-testid="add-device" :disabled="!authToken" @click="addDevice"><PlusIcon data-icon="inline-start" />Добавить</Button><Button v-else data-testid="replace-device" :disabled="!replaceDeviceId" @click="replaceDevice">Заменить выбранное</Button></div>
            <Field v-if="replacementNeeded"><FieldLabel>Устройство для замены</FieldLabel><Select v-model="replaceDeviceId"><SelectTrigger class="w-full" data-testid="replace-select"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem v-for="device in devices" :key="device.id" :value="device.id">{{ device.label }}</SelectItem></SelectGroup></SelectContent></Select></Field>
            <div data-testid="device-list" class="flex flex-col"><template v-for="(device, index) in devices" :key="device.id"><Separator v-if="index" /><div class="flex items-center justify-between gap-4 py-4"><div><p class="font-semibold">{{ device.label }}</p><p class="mt-1 text-sm text-muted-foreground">{{ device.serverName ?? 'No server yet' }} · {{ device.protocols.join(', ') }}</p></div><Button :data-testid="`remove-${device.id}`" variant="destructive" size="icon" aria-label="Удалить устройство" @click="removeDevice(device.id)"><Trash2Icon /></Button></div></template></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Telegram</CardTitle><CardDescription>Свяжите аккаунт для поддержки и уведомлений.</CardDescription></CardHeader>
          <CardContent class="flex flex-col gap-3 sm:flex-row"><Button data-testid="telegram-link-token" variant="outline" :disabled="!authToken" @click="createTelegramLinkToken"><Link2Icon data-icon="inline-start" />Связать Telegram</Button><Input data-testid="telegram-token" :model-value="telegramLinkToken" readonly /></CardContent>
        </Card>
      </section>
    </div>
  </main>
</template>
