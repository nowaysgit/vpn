<script setup lang="ts">
import { SignalIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle
} from '@/components/ui/navigation-menu'
import { cn } from '@/lib/utils'

const cabinetSections = [
  { label: 'Кабинет', to: '#account', active: true },
  { label: 'Подписка', to: '#subscription' },
  { label: 'Устройства', to: '#devices' },
  { label: 'Telegram', to: '#telegram' }
]
</script>

<template>
  <header class="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
    <div class="mx-auto flex min-h-20 w-[min(1400px,calc(100%-2rem))] items-center gap-6">
      <NuxtLink to="/" class="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
        <span class="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><SignalIcon class="size-[18px]" /></span>
        VPN
      </NuxtLink>
      <NavigationMenu :viewport="false" class="ml-auto hidden lg:flex" aria-label="Разделы кабинета">
        <NavigationMenuList class="gap-1">
          <NavigationMenuItem v-for="section in cabinetSections" :key="section.to">
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
      <Button as-child variant="outline" class="ml-auto lg:ml-0"><NuxtLink to="/">На главную</NuxtLink></Button>
    </div>
  </header>
</template>
