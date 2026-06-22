<script setup lang="ts">
import { ArrowRightIcon, CheckIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

const { name, price, detail, devices, featured = false } = defineProps<{
  name: string
  price: string
  detail: string
  devices: string
  featured?: boolean
}>()
</script>

<template>
  <Card class="relative h-full">
    <CardHeader>
      <CardAction v-if="featured"><Badge>Выбирают чаще</Badge></CardAction>
      <p class="text-sm font-semibold text-muted-foreground">{{ name }}</p>
      <CardTitle class="text-3xl tracking-tight">
        {{ price }} <span class="text-xs font-semibold text-muted-foreground">/ месяц</span>
      </CardTitle>
      <p class="text-sm text-muted-foreground">{{ detail }}</p>
    </CardHeader>
    <CardContent>
      <ul class="flex flex-col gap-3 text-sm font-medium">
        <li class="flex items-center gap-2"><CheckIcon class="size-4 text-success" /> Защищённый доступ</li>
        <li class="flex items-center gap-2"><CheckIcon class="size-4 text-success" /> {{ devices }}</li>
        <li class="flex items-center gap-2"><CheckIcon class="size-4 text-success" /> Поддержка в Telegram</li>
      </ul>
    </CardContent>
    <CardFooter>
      <Button :variant="featured ? 'default' : 'outline'" as-child class="w-full">
        <NuxtLink to="/cabinet">Выбрать тариф <ArrowRightIcon data-icon="inline-end" /></NuxtLink>
      </Button>
    </CardFooter>
  </Card>
</template>
