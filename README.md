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
DATABASE_URL=postgres://...
SEED_ADMIN_EMAIL=owner@example.com
SEED_ADMIN_PASSWORD=<strong owner password>
NUXT_PUBLIC_API_BASE_URL=https://api.example.com
JWT_ACCESS_SECRET=...
CREDENTIAL_ENCRYPTION_KEY=<64 hex chars, not all zeroes>
TBANK_API_BASE_URL=https://securepay.tinkoff.ru
TBANK_TERMINAL_KEY=...
TBANK_PASSWORD=...
TBANK_NOTIFICATION_URL=https://api.example.com/payments/webhooks/tbank
TBANK_SUCCESS_URL=https://cabinet.example.com
TBANK_FAIL_URL=https://cabinet.example.com
TBANK_RECEIPT_TAXATION=usn_income
TBANK_RECEIPT_TAX=none
TBANK_RECEIPT_PAYMENT_METHOD=full_payment
TBANK_RECEIPT_PAYMENT_OBJECT=service
PLATEGA_API_BASE_URL=https://api.platega.example
PLATEGA_MERCHANT_ID=...
PLATEGA_SECRET=...
EMAIL_PROVIDER=smtp
EMAIL_VERIFICATION_BASE_URL=https://cabinet.example.com
EMAIL_FROM="VPN Cabinet <no-reply@my-administrator.ru>"
EMAIL_SMTP_HOST=smtp.yandex.ru
EMAIL_SMTP_PORT=465
EMAIL_SMTP_SECURE=true
EMAIL_SMTP_USER=no-reply@my-administrator.ru
EMAIL_SMTP_PASSWORD=<app password>
EMAIL_DOMAIN=my-administrator.ru
EMAIL_DKIM_SELECTOR=mail
MARZBAN_BASE_URL=http://marzban:8000
MARZBAN_USERNAME=...
MARZBAN_PASSWORD=...
EXTERNAL_FALLBACK_URI_TEMPLATE=https://fallback.example/sub/{userId}/{deviceId}
```

В `NODE_ENV=production` backend не стартует без Postgres `DATABASE_URL`, seed owner credentials, реальных production-секретов и публичных HTTPS URL для T-Bank callbacks и external fallback template. `change-me`, `changeme`, `demo`, `demo-secret`, localhost, `*.localhost` и `*.local` считаются невалидными для production.
Основная платежка — T-Bank acquiring через `/v2/Init` и webhook `/payments/webhooks/tbank`; Platega остается запасным провайдером для создания инвойса, если T-Bank недоступен и клиент не выбрал провайдера явно.
Если на терминале T-Bank включена онлайн-касса, заполни `TBANK_RECEIPT_*`, чтобы backend передавал чек в `Init`.
Для подтверждения почты production-контур использует Yandex 360 SMTP. На домене отправителя должны быть настроены SPF, DKIM и DMARC; в dev/test письма пишутся в `output/email-outbox.jsonl`.

## Production Smoke Checks

Перед боевым включением платежей и подтверждения email:

```bash
bun run smoke:tbank
bun run check:yandex360-dns
EMAIL_SMOKE_TO="you@yandex.ru,you@mail.ru,you@gmail.com" bun run smoke:yandex360-email
bun run check:email-delivery
bun run check:production-config -- --env-file .env.production
bun run check:production-readiness
```

`smoke:tbank` создает реальный T-Bank invoice через `/v2/Init`, только если заданы реальные `TBANK_TERMINAL_KEY`, `TBANK_PASSWORD` и публичные HTTPS callback URL.
`check:yandex360-dns` проверяет SPF, DKIM, DMARC и MX для `EMAIL_DOMAIN`.
`smoke:yandex360-email` отправляет verification-письма через Yandex 360 SMTP и сохраняет marker в `output/email-smoke.json`.
`check:email-delivery` заходит по IMAP в тестовые Yandex/Mail.ru/Gmail ящики и проверяет, что marker найден во входящих, а не в spam. Скопируй `scripts/ci/email-delivery-checks.example.json` в `email-delivery-checks.json` и задай пароли через `YANDEX_TEST_IMAP_PASSWORD`, `MAILRU_TEST_IMAP_PASSWORD`, `GMAIL_TEST_IMAP_APP_PASSWORD`.
`check:production-config -- --env-file .env.production` валидирует конкретный production env-файл без печати секретов.
`check:production-readiness` запускает локальные проверки, strict production env preflight, production compose config для backend/customer/admin и все внешние smoke/check gates в строгом режиме: без реальных T-Bank/Yandex/DNS/IMAP env команда должна падать.

## Команды

```bash
bun run ci:check                  # lint + typecheck + unit/API tests
bun run ci:check:backend-dockerfile
bun run build:e2e                 # production build customer/admin Nuxt apps
bun run test:e2e --reporter=list  # local built-web Playwright e2e without Docker
bun run ci:e2e                    # Docker compose e2e stack for CI/Linux runners
bun run check:production-config   # strict active-env production preflight
bun run check:production-config -- --env-file .env.production
bun run smoke:tbank               # real T-Bank Init smoke when TBANK_* are set
bun run check:yandex360-dns       # SPF/DKIM/DMARC/MX DNS check for Yandex 360
bun run smoke:yandex360-email     # SMTP delivery smoke when EMAIL_SMOKE_TO is set
bun run check:email-delivery      # IMAP inbox/spam placement check for smoke marker
bun run check:production-readiness
```

На Windows e2e runner очищает Bun script shim из `PATH`, чтобы Playwright запускал браузер из обычного Node-процесса.

## Graphify

Локальная установка Graphify, первая генерация графа и команды для агента на другой машине описаны в [docs/graphify-local.md](docs/graphify-local.md).
`graphify-out/` и локальные `.codex/`-хуки являются generated/machine-local артефактами и не должны коммититься.

## Покрытие

- Backend API edge cases: email verification, payment idempotency, 4-device limit, explicit replacement, credential revoke on device delete, user-level traffic limit, 1-day grace period, external fallback.
- Telegram link-token flow: web account token, bot-side link, cabinet lookup by Telegram ID.
- Payment provider hardening: T-Bank primary acquiring, Platega fallback, provider webhook signatures/tokens.
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
