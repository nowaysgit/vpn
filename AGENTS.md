# AGENTS.md

## Команды

```bash
bun install
bun run dev:up
bun run dev:down
bun run ci:check
bun run ci:e2e
```

## Менеджер пакетов

Использовать только `bun`, `bunx` и workspace-команды Bun. `npm`, `yarn` и `pnpm` не использовать для проекта.

## Стек

| Слой | Технология |
| --- | --- |
| Backend API | Bun, ElysiaJS, Eden Treaty |
| DB | PostgreSQL, Drizzle migrations |
| Jobs | pg-boss |
| Customer/Admin Web | Nuxt |
| Telegram Bot | GramIO |
| E2E | Playwright |
| Runtime | Docker Compose, Traefik |

## Архитектура

Backend является source of truth. Marzban/Xray и внешний VPN fallback доступны только через provider layer.
Корневой `libs/` предназначен только для контрактов, реально общих между приложениями. Backend-логика, платежные адаптеры, криптография и frontend UI helpers должны жить локально внутри соответствующих `apps/*`.

## Dev Runtime

Dev-окружение управляется платформой my-core через `docker-compose.dev.yml`.
Для UI-тестов используй `$AGENT_DEV_RUNTIME_URL`, если переменная доступна; иначе локальные dev URL.

## Дизайн

Перед изменениями UI читать `DESIGN.md`. Интерфейс должен быть рабочим продуктовым экраном, не лендингом.
