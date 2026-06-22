<script setup lang="ts">
import { BanIcon, FileClockIcon, RefreshCwIcon, SaveIcon, ShieldCheckIcon, SignalIcon } from '@lucide/vue'
import type { AdminAuditEntry, AdminUserListItem, PublicPlan } from '@vpn/api-contract'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle
} from '@/components/ui/navigation-menu'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { AdminApi, type ServerRow } from '~/lib/api'
import { compactDate } from '~/lib/format'

const adminSections = [
  { label: 'Clients', to: '#clients', active: true },
  { label: 'Operations', to: '#operations' },
  { label: 'Servers', to: '#servers' },
  { label: 'Audit', to: '#audit' }
]

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

watch(selectedUser, (user) => {
  notes.value = user?.notes ?? ''
})

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

  const previousUserId = selectedUserId.value
  const [userRows, auditRows, serverRows] = await Promise.all([
    api.users(token.value),
    api.audit(token.value),
    api.servers(token.value)
  ])

  users.value = userRows
  audit.value = auditRows
  servers.value = serverRows
  selectedUserId.value = userRows.some((user) => user.id === previousUserId) ? previousUserId : userRows[0]?.id ?? ''
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

function selectUser(user: AdminUserListItem) {
  selectedUserId.value = user.id
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
  <main class="min-h-screen bg-muted/30">
    <header class="sticky top-0 border-b bg-background/95 backdrop-blur">
      <div class="mx-auto flex min-h-20 w-[min(1400px,calc(100%-2rem))] items-center gap-6">
        <NuxtLink to="/" class="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
          <span class="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <SignalIcon class="size-[18px]" />
          </span>
          VPN Admin
        </NuxtLink>

        <NavigationMenu :viewport="false" class="ml-auto hidden lg:flex" aria-label="Admin sections">
          <NavigationMenuList class="gap-1">
            <NavigationMenuItem v-for="section in adminSections" :key="section.to">
              <NavigationMenuLink
                as-child
                :active="section.active"
                :class="cn(navigationMenuTriggerStyle(), section.active && 'border-b-2 border-primary text-foreground')"
              >
                <NuxtLink :to="section.to">{{ section.label }}</NuxtLink>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <Badge :variant="token ? 'default' : 'secondary'" class="ml-auto lg:ml-0">
          {{ token ? 'Session active' : 'Login required' }}
        </Badge>
      </div>
    </header>

    <div class="mx-auto grid w-[min(1400px,calc(100%-2rem))] gap-6 py-6 xl:grid-cols-[360px_1fr]">
      <aside class="flex flex-col gap-6">
        <Card id="access">
          <CardHeader>
            <CardTitle>Admin access</CardTitle>
            <CardDescription>Войдите, чтобы управлять клиентами, тарифами и серверами.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel for="admin-email">Email</FieldLabel>
                <Input id="admin-email" v-model="email" data-testid="admin-email" autocomplete="email" />
              </Field>
              <Field>
                <FieldLabel for="admin-password">Password</FieldLabel>
                <Input
                  id="admin-password"
                  v-model="password"
                  data-testid="admin-password"
                  type="password"
                  autocomplete="current-password"
                />
              </Field>
              <Button data-testid="admin-login" :disabled="loading" @click="login">
                <ShieldCheckIcon data-icon="inline-start" />
                Login
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card id="operations">
          <CardHeader>
            <CardTitle>Manual operations</CardTitle>
            <CardDescription>
              {{ selectedUser ? selectedUser.email : 'Выберите клиента после входа.' }}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel for="admin-user-select">Client</FieldLabel>
                <Select v-model="selectedUserId">
                  <SelectTrigger id="admin-user-select" data-testid="admin-user-select" class="w-full">
                    <SelectValue placeholder="Выберите клиента" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem v-for="user in users" :key="user.id" :value="user.id">
                        {{ user.email }}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel for="admin-plan-select">Plan</FieldLabel>
                <Select v-model="selectedPlanId">
                  <SelectTrigger id="admin-plan-select" data-testid="admin-plan-select" class="w-full">
                    <SelectValue placeholder="Выберите тариф" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem v-for="plan in plans" :key="plan.id" :value="plan.id">
                        {{ plan.title }}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel>Subscription actions</FieldLabel>
                <FieldDescription>Grant выдаёт выбранный тариф, Block отключает клиента.</FieldDescription>
                <div class="flex flex-col gap-2 sm:flex-row">
                  <Button data-testid="admin-grant" :disabled="!selectedUserId" @click="grant">
                    <ShieldCheckIcon data-icon="inline-start" />
                    Grant
                  </Button>
                  <Button
                    variant="destructive"
                    data-testid="admin-block"
                    :disabled="!selectedUserId"
                    @click="block"
                  >
                    <BanIcon data-icon="inline-start" />
                    Block
                  </Button>
                </div>
              </Field>

              <Field>
                <FieldLabel for="admin-notes">Client notes</FieldLabel>
                <Textarea id="admin-notes" v-model="notes" rows="4" data-testid="admin-notes" />
              </Field>

              <Button variant="outline" data-testid="admin-save-notes" :disabled="!selectedUserId" @click="saveNotes">
                <SaveIcon data-icon="inline-start" />
                Save notes
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>
      </aside>

      <section class="flex min-w-0 flex-col gap-6">
        <Alert v-if="error" variant="destructive" data-testid="admin-error">
          <AlertTitle>Не удалось выполнить действие</AlertTitle>
          <AlertDescription>{{ error }}</AlertDescription>
        </Alert>
        <Alert v-if="notice" data-testid="admin-notice">
          <AlertTitle>Готово</AlertTitle>
          <AlertDescription>{{ notice }}</AlertDescription>
        </Alert>

        <div class="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Clients</CardDescription>
              <CardTitle class="text-3xl">{{ users.length }}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Servers</CardDescription>
              <CardTitle class="text-3xl">{{ servers.length }}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Selected</CardDescription>
              <CardTitle class="text-3xl">{{ selectedUser?.subscriptionStatus ?? 'none' }}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card id="clients">
          <CardHeader class="gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Clients</CardTitle>
              <CardDescription>Клик по строке выбирает клиента для ручных операций.</CardDescription>
            </div>
            <CardAction>
              <Button variant="outline" data-testid="admin-refresh" :disabled="!token" @click="refreshAdmin">
                <RefreshCwIcon data-icon="inline-start" />
                Refresh
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Table data-testid="admin-users">
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ends</TableHead>
                  <TableHead>Traffic</TableHead>
                  <TableHead>Devices</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableEmpty v-if="!users.length" :colspan="6">Нет клиентов для отображения.</TableEmpty>
                <TableRow
                  v-for="user in users"
                  :key="user.id"
                  :data-state="selectedUserId === user.id ? 'selected' : undefined"
                  class="cursor-pointer"
                  @click="selectUser(user)"
                >
                  <TableCell class="font-medium">{{ user.email }}</TableCell>
                  <TableCell>
                    <Badge :variant="user.subscriptionStatus === 'active' ? 'default' : 'secondary'">
                      {{ user.subscriptionStatus }}
                    </Badge>
                  </TableCell>
                  <TableCell>{{ compactDate(user.subscriptionEndsAt) }}</TableCell>
                  <TableCell>{{ user.trafficUsedGb }}/{{ user.trafficLimitGb }} GB</TableCell>
                  <TableCell>{{ user.deviceCount }}</TableCell>
                  <TableCell class="max-w-56 truncate">{{ user.notes ?? 'none' }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card id="servers">
          <CardHeader>
            <CardTitle>Servers</CardTitle>
            <CardDescription>Провайдеры и протоколы, доступные клиентам.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table data-testid="admin-servers">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Protocols</TableHead>
                  <TableHead>User visible</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableEmpty v-if="!servers.length" :colspan="5">Нет серверов для отображения.</TableEmpty>
                <TableRow v-for="server in servers" :key="server.id">
                  <TableCell class="font-medium">{{ server.name }}</TableCell>
                  <TableCell>{{ server.provider }}</TableCell>
                  <TableCell>{{ server.locationCode }}</TableCell>
                  <TableCell>{{ server.protocols.join(', ') }}</TableCell>
                  <TableCell>
                    <Badge :variant="server.visibleToCustomer ? 'default' : 'secondary'">
                      {{ server.visibleToCustomer ? 'yes' : 'no' }}
                    </Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card id="audit">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <FileClockIcon class="size-5 text-success" />
              Audit log
            </CardTitle>
            <CardDescription>Последние административные действия.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table data-testid="admin-audit">
              <TableHeader>
                <TableRow>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableEmpty v-if="!audit.length" :colspan="4">Audit log пока пуст.</TableEmpty>
                <TableRow v-for="entry in audit" :key="entry.id">
                  <TableCell class="font-medium">{{ entry.actorEmail }}</TableCell>
                  <TableCell>{{ entry.action }}</TableCell>
                  <TableCell>{{ entry.targetType }}: {{ entry.targetId }}</TableCell>
                  <TableCell>{{ compactDate(entry.createdAt) }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  </main>
</template>
