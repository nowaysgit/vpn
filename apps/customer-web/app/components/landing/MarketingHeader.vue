<script setup lang="ts">
import { MenuIcon, SignalIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle
} from '@/components/ui/navigation-menu'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet'

const navigationLinks = [
  { label: 'Как это работает', to: '#how-it-works' },
  { label: 'Тарифы', to: '#plans' },
  { label: 'Вопросы', to: '#answers' }
]
</script>

<template>
  <header class="mx-auto flex min-h-20 w-[min(1180px,calc(100%-2rem))] items-center gap-6 border-b">
    <NuxtLink to="/" class="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
      <span class="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <SignalIcon class="size-[18px]" />
      </span>
      VPN
    </NuxtLink>

    <NavigationMenu :viewport="false" class="ml-auto hidden md:flex" aria-label="Навигация по странице">
      <NavigationMenuList class="gap-1">
        <NavigationMenuItem v-for="link in navigationLinks" :key="link.to">
          <NavigationMenuLink as-child :class="navigationMenuTriggerStyle()">
            <NuxtLink :to="link.to">{{ link.label }}</NuxtLink>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>

    <Button as-child class="hidden md:inline-flex">
      <NuxtLink to="/cabinet">Начать</NuxtLink>
    </Button>

    <Sheet>
      <SheetTrigger as-child>
        <Button variant="outline" size="icon" class="ml-auto md:hidden" aria-label="Открыть навигацию">
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" class="flex flex-col gap-6">
        <SheetHeader>
          <SheetTitle>VPN</SheetTitle>
        </SheetHeader>
        <Separator />
        <nav class="flex flex-col gap-1" aria-label="Мобильная навигация">
          <Button v-for="link in navigationLinks" :key="link.to" as-child variant="ghost" class="justify-start">
            <NuxtLink :to="link.to">{{ link.label }}</NuxtLink>
          </Button>
        </nav>
        <Button as-child size="lg">
          <NuxtLink to="/cabinet">Открыть кабинет</NuxtLink>
        </Button>
      </SheetContent>
    </Sheet>
  </header>
</template>
