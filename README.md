# VPN Platform

Монорепо VPN-продукта: Bun + ElysiaJS backend как source of truth, Nuxt customer/admin apps, Telegram bot, provisioning worker и shared contracts только для межприложенческих типов.

## Сервисы

| Сервис | Путь | Порт |
|---|---|---:|
| Backend API | `apps/backend` | `3001` |
| Customer Web | `apps/customer-web` | `3000` |
| Admin Web | `apps/admin-web` | `3002` |
| Telegram Bot | `apps/telegram-bot` | - |
| Provisioning Worker | `apps/provisioning-worker` | - |
| Shared API contracts | `libs/api-contract` | - |
| Shared provider contracts | `libs/provider-contract` | - |

## Быстрый Старт

```bash
bun install
bun run dev:up
```

Dev compose поднимает Postgres, API, customer/admin web, bot и worker. Backend при контейнерном старте выполняет `bun run migrate`, затем запускает API.

## Production Env

Скопируй `.env.example` и обязательно замени production-секреты:

```env
APP_STORE_DRIVER=postgres
DATABASE_URL=postgres://...
JWT_ACCESS_SECRET=...
CREDENTIAL_ENCRYPTION_KEY=<64 hex chars, not all zeroes>
PLATEGA_API_BASE_URL=https://api.platega.example
PLATEGA_MERCHANT_ID=change-me
PLATEGA_SECRET=change-me
ROLLYPAY_API_BASE_URL=https://api.rollypay.example
ROLLYPAY_MERCHANT_ID=change-me
ROLLYPAY_SECRET=change-me
MARZBAN_BASE_URL=http://marzban:8000
MARZBAN_USERNAME=change-me
MARZBAN_PASSWORD=change-me
EXTERNAL_FALLBACK_URI_TEMPLATE=https://fallback.example/sub/{userId}/{deviceId}
```

В `NODE_ENV=production` backend не стартует на memory-store или дефолтных секретах.

## Команды

```bash
bun run ci:check                  # lint + typecheck + unit/API tests
bun run ci:check:backend-dockerfile
bun run build:e2e                 # production build customer/admin Nuxt apps
node scripts/ci/run-local-e2e.mjs --reporter=list
bun run ci:e2e                    # Docker compose e2e stack for CI/Linux runners
```

На этой Windows-сессии `bun run test:e2e` стабильно ломает Playwright browser launch из-за Bun script ancestry. Сам Playwright и тесты проходят через прямой Node runner: `node scripts/ci/run-local-e2e.mjs`.

## Покрытие

- Backend API edge cases: email verification, payment idempotency, 4-device limit, explicit replacement, credential revoke on device delete, user-level traffic limit, 1-day grace period, external fallback.
- Telegram link-token flow: web account token, bot-side link, cabinet lookup by Telegram ID.
- Payment provider hardening: configurable Platega/RollyPay endpoints and HMAC webhook signatures.
- Provider hardening: Marzban token auth, remote provision/revoke, worker-side provider jobs.
- Security: encrypted VPN credentials reject wrong key.
- Production config guard.
- Conditional Postgres integration test via `TEST_DATABASE_URL`.
- Frontend/Telegram/worker unit tests.
- Playwright e2e: backend API flow, customer cabinet, admin cabinet.

## Архитектура

```text
Backend API
users, subscriptions, payments, devices, Telegram/admin operations
        |
Provider Layer
Marzban/Xray primary, manual external fallback now, AmneziaWG later
        |
VPN Nodes
VLESS REALITY, Trojan TLS, Shadowsocks, external fallback
```

Root `libs` содержит только контракты, которые реально нужны нескольким приложениям. Backend/frontend локальная логика живет внутри соответствующих `apps/*/src` или `apps/*/app/lib`.
