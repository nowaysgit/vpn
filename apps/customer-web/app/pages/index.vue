<script setup lang="ts">
import {
  ArrowRightIcon,
  CheckIcon,
  Globe2Icon,
  LaptopIcon,
  LockKeyholeIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  ZapIcon
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import MarketingHeader from '@/components/landing/MarketingHeader.vue'
import PlanCard from '@/components/landing/PlanCard.vue'

const plans = [
  { name: 'Старт', price: '199 ₽', detail: 'Для одного устройства', devices: '1 устройство' },
  { name: 'Свобода', price: '349 ₽', detail: 'На каждый день', devices: 'До 5 устройств', featured: true },
  { name: 'Команда', price: '699 ₽', detail: 'Для близких и команды', devices: 'До 10 устройств' }
]

const advantages = [
  { icon: ShieldCheckIcon, title: 'Безопасный маршрут', text: 'Современные протоколы и защищённое соединение без ручной настройки.' },
  { icon: ZapIcon, title: 'Подключение за минуту', text: 'Получите ссылку, добавьте её в приложение — и можно идти в интернет.' },
  { icon: Globe2Icon, title: 'Где бы вы ни были', text: 'Работает на телефоне, ноутбуке и домашнем роутере одновременно.' }
]
</script>

<template>
  <main class="min-h-screen overflow-x-hidden">
    <MarketingHeader />

    <section class="mx-auto grid min-h-[620px] w-[min(1180px,calc(100%-2rem))] items-center gap-12 py-16 lg:grid-cols-2 lg:py-20" aria-labelledby="hero-title">
      <div class="max-w-xl">
        <p class="mb-5 flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <span class="size-2 rounded-full bg-primary" /> Приватный интернет для ваших устройств
        </p>
        <h1 id="hero-title" class="text-5xl font-extrabold leading-[.98] tracking-[-0.06em] sm:text-6xl lg:text-7xl">
          Интернет остаётся<br><span class="text-success">вашим.</span>
        </h1>
        <p class="mt-7 max-w-lg text-base font-medium leading-7 text-muted-foreground sm:text-lg">
          Один защищённый доступ для телефона, компьютера и роутера. Без сложных настроек и долгих инструкций.
        </p>
        <div class="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Button as-child size="lg" class="h-13 px-6 text-base">
            <NuxtLink to="/cabinet">Открыть кабинет <ArrowRightIcon data-icon="inline-end" /></NuxtLink>
          </Button>
          <Button as-child variant="link" class="justify-start px-0 text-foreground sm:justify-center">
            <NuxtLink to="#how-it-works">Посмотреть как работает</NuxtLink>
          </Button>
        </div>
        <div class="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-muted-foreground">
          <span class="flex items-center gap-2"><CheckIcon class="size-4 text-success" /> Подключение за 1 минуту</span>
          <span class="flex items-center gap-2"><CheckIcon class="size-4 text-success" /> До 10 устройств</span>
        </div>
      </div>

      <div class="relative grid min-h-92 place-items-center">
        <div class="absolute inset-[12%_5%] -rotate-6 rounded-[45%_55%_52%_48%/42%_40%_60%_58%] bg-linear-to-br from-mint via-primary to-forest" />
        <Card class="relative w-full max-w-98 shadow-xl">
          <CardHeader class="flex-row items-start justify-between">
            <div>
              <p class="flex items-center gap-2 text-xs font-bold text-muted-foreground"><span class="size-2 rounded-full bg-success" /> Защита активна</p>
              <h2 class="mt-2 text-xl font-bold tracking-tight">Москва → Амстердам</h2>
            </div>
            <span class="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground"><LockKeyholeIcon class="size-5" /></span>
          </CardHeader>
          <CardContent class="flex flex-col gap-7">
            <div class="flex items-center gap-3"><span class="size-3 rounded-full border-2 border-foreground" /><span class="h-0.5 flex-1 bg-border" /><span class="size-3 rounded-full bg-primary ring-2 ring-primary" /></div>
            <div class="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              <span class="text-sm font-semibold text-muted-foreground">Скорость</span>
              <strong class="text-2xl tracking-tight">98 <small class="text-xs text-muted-foreground">Мбит/с</small></strong>
              <span class="flex items-center gap-1 text-[11px] font-bold text-success"><LockKeyholeIcon class="size-3" /> Шифрование включено</span>
            </div>
          </CardContent>
        </Card>
        <span class="absolute right-0 top-8 flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-xs font-bold shadow-sm"><SmartphoneIcon class="size-4" /> Телефон</span>
        <span class="absolute bottom-6 left-0 flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-xs font-bold shadow-sm"><LaptopIcon class="size-4" /> Ноутбук</span>
      </div>
    </section>

    <Separator />

    <section id="how-it-works" class="mx-auto w-[min(1180px,calc(100%-2rem))] py-18 sm:py-24" aria-labelledby="steps-title">
      <p class="text-xs font-bold uppercase tracking-wide text-success">Без технического квеста</p>
      <h2 id="steps-title" class="mt-3 text-4xl font-extrabold tracking-[-0.04em] sm:text-5xl">Три шага — и всё работает.</h2>
      <ol class="mt-12 grid divide-y border-t lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <li v-for="(step, index) in ['Создайте аккаунт', 'Получите ссылку', 'Добавьте устройство']" :key="step" class="py-7 lg:px-8 lg:first:pl-0 lg:last:pr-0">
          <span class="text-sm font-bold text-muted-foreground">0{{ index + 1 }}</span>
          <h3 class="mt-8 text-xl font-bold tracking-tight">{{ step }}</h3>
          <p class="mt-3 text-sm font-medium leading-6 text-muted-foreground">{{ ['Введите почту и выберите удобный тариф.', 'Она уже содержит настройки для безопасного доступа.', 'Скопируйте ссылку в приложение и пользуйтесь.'][index] }}</p>
        </li>
      </ol>
    </section>

    <section class="grid border-y bg-muted/50 md:grid-cols-3" aria-label="Преимущества VPN">
      <article v-for="advantage in advantages" :key="advantage.title" class="mx-auto flex min-h-56 w-full max-w-md flex-col border-b px-8 py-9 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
        <component :is="advantage.icon" class="size-6 text-success" />
        <h2 class="mt-10 text-xl font-bold tracking-tight">{{ advantage.title }}</h2>
        <p class="mt-3 text-sm font-medium leading-6 text-muted-foreground">{{ advantage.text }}</p>
      </article>
    </section>

    <section id="plans" class="mx-auto w-[min(1180px,calc(100%-2rem))] py-18 sm:py-24" aria-labelledby="pricing-title">
      <div class="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-success">Просто и прозрачно</p>
          <h2 id="pricing-title" class="mt-3 text-4xl font-extrabold tracking-[-0.04em] sm:text-5xl">Выберите свой ритм.</h2>
        </div>
        <p class="max-w-xs text-sm font-medium leading-6 text-muted-foreground">Меняйте тариф в личном кабинете, когда это понадобится.</p>
      </div>
      <div class="mt-12 grid gap-5 md:grid-cols-3">
        <PlanCard v-for="plan in plans" :key="plan.name" v-bind="plan" />
      </div>
    </section>

    <section id="answers" class="mx-auto grid w-[min(1180px,calc(100%-2rem))] gap-10 border-t py-18 sm:py-24 md:grid-cols-2 md:items-end" aria-labelledby="answer-title">
      <div>
        <p class="text-xs font-bold uppercase tracking-wide text-success">Нужна помощь?</p>
        <h2 id="answer-title" class="mt-3 text-4xl font-extrabold tracking-[-0.04em] sm:text-5xl">В кабинете есть всё,<br>чтобы начать.</h2>
      </div>
      <div class="flex flex-col items-start gap-7">
        <p class="text-base font-medium leading-7 text-muted-foreground">Управляйте устройствами, копируйте ссылку для подключения и свяжите Telegram — всё в одном спокойном месте.</p>
        <Button as-child size="lg"><NuxtLink to="/cabinet">Перейти в кабинет <ArrowRightIcon data-icon="inline-end" /></NuxtLink></Button>
      </div>
    </section>

    <footer class="mx-auto flex w-[min(1180px,calc(100%-2rem))] flex-col gap-4 border-t py-8 text-sm font-medium text-muted-foreground sm:flex-row sm:items-center">
      <span class="font-bold text-foreground">VPN</span>
      <span class="sm:ml-auto">Приватный доступ без лишнего шума.</span>
      <NuxtLink to="/cabinet" class="font-semibold text-foreground hover:underline">Личный кабинет</NuxtLink>
    </footer>
  </main>
</template>
