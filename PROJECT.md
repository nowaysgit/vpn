# PROJECT.md — Стандарт проекта под управлением my-core

Обязательные конвенции для любого проекта, управляемого платформой **my-core**:
структура, команды, CI, Docker и интеграция с Traefik.

Скопируй файл в корень нового проекта.

---

## 1. Структура проекта

```
{slug}/
├── apps/             # приложения (бэкенд, фронтенд, лендинг и любые другие)
│   └── <app>/
│       └── docker-compose.yml
├── libs/             # общие библиотеки (shared типы, утилиты)
├── scripts/
│   └── ci/           # универсальные CI-скрипты
│       ├── check-affected.mjs
│       ├── check-backend-docker-workspace.mjs
│       ├── run-e2e-stack.mjs
│       ├── write-deploy-env.sh
│       └── workflow-template.yaml
├── package.json
└── PROJECT.md
```

Каждое приложение в `apps/` и библиотека в `libs/` — отдельный Bun workspace-пакет
с полем `name` в `package.json`.

---

## 2. Интерфейс каждого пакета

Каждый пакет в `apps/*` и `libs/*` обязан реализовывать:

| Команда      | Назначение                                          | Обязательна |
|--------------|-----------------------------------------------------|-------------|
| `lint`       | ESLint по исходникам пакета                         | ✅          |
| `lint:fix`   | `lint --fix`                                        | ✅          |
| `typecheck`  | `tsc --noEmit`                                      | ✅          |
| `test`       | Unit/integration тесты (`bun test` / vitest)        | если есть   |
| `ci:check`   | `lint + typecheck + test` — без сети, без e2e       | ✅          |
| `ci:fix`     | `lint:fix`                                          | ✅          |

`ci:check` должен быть **быстрым, offline и идемпотентным** — он запускается агентом
внутри pipeline.

Шаблон `package.json` для нового пакета:

```json
{
  "scripts": {
    "lint":      "eslint src",
    "lint:fix":  "eslint src --fix",
    "typecheck": "tsc --noEmit",
    "test":      "bun test",
    "ci:check":  "bun run lint && bun run typecheck && bun run test",
    "ci:fix":    "bun run lint:fix"
  }
}
```

Добавить пакет в CI достаточно просто создав его — `check-affected.mjs` сам
обнаружит его в `apps/*` / `libs/*`. **Обновлять `ciPolicy` не нужно.**

---

## 3. Корневые команды (`package.json`)

```json
{
  "scripts": {
    "ci:check:affected":           "bun scripts/ci/check-affected.mjs --check",
    "ci:fix:affected":             "bun scripts/ci/check-affected.mjs --fix",
    "ci:check:lint":               "bunx eslint . --max-warnings 0",
    "ci:fix:lint":                 "bunx eslint . --fix",
    "ci:check:types":              "bun run --filter '*' typecheck",
    "ci:check:tests":              "bun run --filter '*' test",
    "ci:check:backend-dockerfile": "bun scripts/ci/check-backend-docker-workspace.mjs",
    "ci:e2e":                      "bun scripts/ci/run-e2e-stack.mjs",
    "ci:stack:up":                 "bun scripts/ci/run-e2e-stack.mjs --up",
    "ci:stack:down":               "bun scripts/ci/run-e2e-stack.mjs --down"
  }
}
```

Опциональные инфра-скрипты (добавлять только если есть backend Dockerfile):

```json
"ci:check:backend-dockerfile": "bun scripts/ci/check-backend-docker-workspace.mjs",
"ci:check:backend-docker-build": "docker build --target builder -f apps/backend/Dockerfile ."
```

---

## 4. CI-скрипты (`scripts/ci/`)

Директория **переносимая** — копируется в любой проект без изменений.

| Скрипт | Назначение |
|--------|-----------|
| `check-affected.mjs` | Определяет затронутые пакеты по `git diff`, запускает их `ci:check` |
| `check-backend-docker-workspace.mjs` | Проверяет, что `COPY`-инструкции Dockerfile соответствуют workspace |
| `run-e2e-stack.mjs` | Управляет docker-compose стеком для e2e (up / run / down) |
| `write-deploy-env.sh` | Собирает `.env` для `docker compose` из переменных окружения CI |

### Как работает `check-affected.mjs`

```
git changed files
       │
       ▼
check-affected.mjs
       │
       ├─ maps changes → package dirs (apps/*, libs/*)
       ├─ infra files (bun.lock, Dockerfile, …) → ci:check:backend-dockerfile
       └─ runs `bun run --cwd <pkg> ci:check` для каждого затронутого пакета
```

Инфра-файлы, вызывающие `ci:check:backend-dockerfile`:
`package.json`, `bun.lock`, `patches/`, `Dockerfile`, `docker-compose*.yml`,
`.github/`, `scripts/ci/`

### Команды `run-e2e-stack.mjs`

```bash
bun run ci:e2e          # up → e2e → down (используется в pipeline и CI)
bun run ci:stack:up     # только поднять стек (локальная отладка)
bun run ci:stack:down   # только остановить стек
```

Принимает `--compose-file <path>`, `--ensure-only`, `--down`, `--down-after`.

---

## 5. CI — агентский пайплайн (my-core)

### Стейджи

```
01 Планирование
02 CI Проверка        ← bun run ci:check:affected
03 Реализация
04 Code Review
05 Интеграция
06 Финальный CI       ← bun run ci:check:affected
07 E2E Тесты          ← bun run ci:e2e
08 Git Commit
```

| Стейдж | Команда | При ошибке |
|--------|---------|-----------|
| `02 CI Проверка` | `ci:check:affected` | Агент фиксит, повторяет стейдж — до 3 итераций |
| `06 Финальный CI` | `ci:check:affected` | Агент фиксит, повторяет стейдж — до 5 итераций |
| `07 E2E Тесты` | `ci:e2e` | Агент фиксит, повторяет стейдж — до 3 итераций |

Цикл исправлений E2E работает по той же логике, что стейджи 02 и 06: агент анализирует вывод,
вносит правки, перезапускает тест. Если лимит итераций исчерпан — pipeline падает.
Git Commit (08) выполняется только после успешного прохождения E2E.

### `ciPolicy` в настройках pipeline

```json
{ "**": ["bun run ci:check:affected"] }
```

Glob `**` матчит все изменённые файлы. Runner дедуплицирует команды через `Set` —
скрипт запускается ровно один раз за стейдж, независимо от количества файлов.

> **Не добавляй per-package glob-записи** — auto-detection всё сделает сам.

---

## 6. CI — GitHub Actions

Основа: `scripts/ci/workflow-template.yaml` → `.github/workflows/production.yaml`.

### Структура workflow

```
changes (path filter)
  ├── ci-<app>          ← lint + typecheck + tests для каждого приложения
  ├── ci-e2e            ← bun run ci:e2e (полный стек + Playwright)
  └── deploy-<app>      ← деплой на сервер (project-specific)
        └── smoke       ← проверка доступности после деплоя
```

### Что настраивать в каждом проекте

| Параметр | Где менять |
|----------|-----------|
| Slug проекта | `name:`, docker project names, имена log-файлов |
| Список приложений в `changes` | `outputs:` + `files_yaml:` patterns |
| Порты CI-сервисов | Не должны совпадать с портами prod стека |
| Env vars бэкенда | Блок `env:` в ci и e2e jobs |
| Deploy jobs | Добавить после `e2e` |

### Что одинаково в каждом проекте

- Bun setup: `oven-sh/setup-bun@v2`
- Имена команд `bun run ci:check:*` (определяются стандартным интерфейсом)
- Шаг `Fix Docker-owned file permissions`
- Детектор изменений: `tj-actions/changed-files@v47`
- Playwright Docker image (auto-detect из `node_modules`)

### Переменные окружения

- `vars.*` — несекретные настройки (домены, порты)
- `secrets.*` — пароли, токены, ключи

`scripts/ci/write-deploy-env.sh` собирает их в `.env`-файл для `docker compose`.

При добавлении новой переменной:
1. Блок `env:` нужного job в workflow
2. `write-deploy-env.sh`
3. `environment:` нужного сервиса в compose

Никогда не хардкодить секреты в compose-файлах или workflow.

### Подключение

1. Скопировать `workflow-template.yaml` → `.github/workflows/production.yaml`
2. Заполнить все `TODO:` маркеры
3. Добавить Secrets и Vars в настройках GitHub-репозитория
4. Заполнить `write-deploy-env.sh`

---

## 7. Docker — нейминг

### Контейнеры: `{slug}-{роль}`

Паттерн: `container_name: ${COMPOSE_PROJECT_NAME:-{slug}}-{роль}`

Роли — произвольные, лишь бы имя было уникально на сервере. Инфра-контейнеры
(БД, кеш, хранилище) и CI-контейнеры по соглашению:

| Тип | container_name |
|-----|----------------|
| PostgreSQL (prod) | `{slug}-postgres` |
| Redis (prod) | `{slug}-redis` |
| Storage | `{slug}-storage` |
| PostgreSQL (CI) | `{slug}-test-postgres` |
| Redis (CI) | `{slug}-test-redis` |

`test`-инстансы поднимаются только во время CI на отдельных портах.

### Docker Compose project name

| Среда | project name |
|-------|--------------|
| Prod  | `{slug}` |
| Dev   | `{slug}-dev` |

Project name изолирует volumes автоматически: `{slug}_postgres_data` vs `{slug}-dev_postgres_data`.

Зафиксировать project name можно только через поле `name:` в compose-файле — Docker Compose всегда устанавливает `COMPOSE_PROJECT_NAME` из имени директории файла, поэтому fallback `:-{slug}` в `container_name` никогда не срабатывает без явного `name:`.

### Volumes

Называй без лишних префиксов — Docker добавит project name сам:

```
postgres_data, redis_data, storage_data
root_node_modules, bun_cache
```

---

## 8. Docker — compose-файлы

### Объединение при деплое

```bash
docker compose \
  --project-name {slug} \
  --env-file .env.production \
  $(for app in apps/*/docker-compose.yml; do echo "-f $app"; done) \
  up -d
```

### Инфраструктура

Инфра-сервисы (БД, кеш, хранилище) удобно держать в compose-файле одного из
приложений. Они подключаются только к internal-сети.

### Шаблон публичного сервиса (с Traefik labels)

```yaml
name: {slug}

services:
  <app>:
    image: oven/bun:${BUN_VERSION:-1.3.14}
    container_name: ${COMPOSE_PROJECT_NAME:-{slug}}-<app>
    restart: unless-stopped
    networks:
      - internal
      - edge
    labels:
      - traefik.enable=true
      - traefik.docker.network=${EDGE_NETWORK:-vds-edge}
      - traefik.http.services.{slug}-<app>.loadbalancer.server.port=<port>
      - traefik.http.middlewares.{slug}-https-redirect.redirectscheme.scheme=https
      - traefik.http.routers.{slug}-<app>-http.rule=Host(`${APP_DOMAIN}`)
      - traefik.http.routers.{slug}-<app>-http.entrypoints=web
      - traefik.http.routers.{slug}-<app>-http.middlewares={slug}-https-redirect
      - traefik.http.routers.{slug}-<app>.rule=Host(`${APP_DOMAIN}`)
      - traefik.http.routers.{slug}-<app>.entrypoints=websecure
      - traefik.http.routers.{slug}-<app>.tls=true
      - traefik.http.routers.{slug}-<app>.tls.certresolver=${TRAEFIK_CERT_RESOLVER:-letsencrypt}
      - traefik.http.routers.{slug}-<app>.service={slug}-<app>

networks:
  internal:
    name: ${COMPOSE_PROJECT_NAME:-{slug}}-internal
  edge:
    name: ${EDGE_NETWORK:-vds-edge}
    external: true
```

**Правила:**
- Имена роутеров и сервисов в labels **глобально уникальны** на сервере → `{slug}-{роль}`
- `traefik.docker.network` всегда = `vds-edge`
- Только публичные сервисы подключаются к `vds-edge`; инфра — только к `internal`

---

## 9. Docker — сети

```
┌──────────── vds-edge (shared, external) ──────────────┐
│  Traefik (80/443)                                     │
│    ↕                                                  │
│  {slug}-<app>   {slug}-<app2>   ...                   │
│  {other}-<app>  ...                                   │
└───────────────────────────────────────────────────────┘
        │                          │
┌─ {slug}-internal ──┐   ┌─ {other}-internal ──┐
│  все сервисы slug  │   │  все сервисы other  │
│  postgres, redis   │   │  postgres, redis     │
└────────────────────┘   └─────────────────────┘
```

`vds-edge` создаётся один раз на сервере:

```bash
docker network create vds-edge
```

Все проекты ссылаются на неё как `external: true`. Внутренние сети изолированы.

---

## 10. Traefik — интеграция

Traefik работает с двумя провайдерами одновременно:

| Провайдер  | Где настраивается             | Когда использовать                              |
|------------|-------------------------------|--------------------------------------------------|
| **Docker** | Labels в `docker-compose.yml` | Контейнеры на том же сервере                    |
| **File**   | Файл `dynamic/{slug}.yml`     | Внешние сервисы, другой сервер, кастом-правила  |

```
Сервис — Docker-контейнер на этом сервере?
  ДА  → labels в docker-compose.yml   (авто-применяется, перезапуск не нужен)
  НЕТ → dynamic/{slug}.yml            (авто-применяется через file watcher)
```

Статический конфиг (ACME email, entrypoints) — требует перезапуска Traefik.

---

## 11. Dev Runtime — интеграция с my-core

### Как работает Dev Runtime

Платформа my-core запускает живое dev-окружение через **server-agent** — процесс на том же сервере, где работает раннер. Схема работы:

1. Runner создаёт ветку `agent/<job-id>` от `workingBranch`
2. Server-agent получает команду переключить Dev Runtime на эту ветку
3. Server-agent переходит на ветку в общем checkout проекта (`RUNTIME_WORKSPACE_ROOT/<project-slug>`) и выполняет `docker compose -f docker-compose.dev.yml up -d`
4. Traefik автоматически подключает dev-домены к контейнерам
5. После завершения job Runtime возвращается к `workingBranch`

### Обязательный файл: `docker-compose.dev.yml` в корне

**Это единственный файл, который читает server-agent для Dev Runtime.** Без него Dev Runtime не работает.

Файл должен:
- Иметь поле `name: {slug}-dev` (изолирует volumes от prod)
- Включать все необходимые сервисы через `include:` или описывать их напрямую
- Задавать dev-специфичные настройки: порты, env, команды

Шаблон `docker-compose.dev.yml`:

```yaml
name: {slug}-dev

# Включаем per-app compose файлы; project_directory: . важен для правильного разрешения путей
include:
  - path: apps/<app1>/docker-compose.yml
    project_directory: .
  - path: apps/<app2>/docker-compose.yml
    project_directory: .

services:
  # Переопределяем контейнеры для dev — имена, env, порты
  postgres:
    container_name: ${COMPOSE_PROJECT_NAME:-{slug}-dev}-postgres
    environment:
      POSTGRES_DB: {slug}_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    container_name: ${COMPOSE_PROJECT_NAME:-{slug}-dev}-redis

  api:
    container_name: ${COMPOSE_PROJECT_NAME:-{slug}-dev}-api
    environment:
      NODE_ENV: development
      POSTGRES_HOST: postgres
      POSTGRES_DB: {slug}_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      REDIS_URL: redis://redis:6379/0
      API_DOMAIN: ${API_DOMAIN:-dev.api.{slug}.localhost}

  frontend:
    container_name: ${COMPOSE_PROJECT_NAME:-{slug}-dev}-frontend
    environment:
      APP_DOMAIN: ${APP_DOMAIN:-dev.{slug}.localhost}
      API_BASE_URL: ${API_BASE_URL:-http://api:3001}

volumes:
  postgres_data:
```

**Правила:**
- Все домены через env-переменные — server-agent передаёт свои значения через `.env` в корне репозитория
- Секреты не хардкодить; использовать `env_file` или env-переменные из `.env`
- Один `docker-compose.dev.yml` управляет всем dev-стеком проекта

### Корневые команды для dev-стека

Добавь в корневой `package.json`:

```json
{
  "scripts": {
    "dev:up":   "docker compose -f docker-compose.dev.yml up -d",
    "dev:down": "docker compose -f docker-compose.dev.yml down",
    "dev:logs": "docker compose -f docker-compose.dev.yml logs -f"
  }
}
```

### .env в корне репозитория

Server-agent автоматически подхватывает `.env` из корня репозитория как `--env-file` для `docker compose`. Помести dev-значения в `.env`:

```bash
# .env (в .gitignore)
API_DOMAIN=dev.api.{slug}.yourdomain.com
APP_DOMAIN=dev.{slug}.yourdomain.com
API_BASE_URL=https://dev.api.{slug}.yourdomain.com
POSTGRES_PASSWORD=dev-password-change-me
```

`.env` добавить в `.gitignore`. Пример зафиксировать как `.env.example`.

### Настройка Dev Runtime в my-core

В настройках проекта → **Dev Runtime**:

1. Выбери **Server Agent** из выпадающего списка
2. Укажи **Runtime Repo Path** — абсолютный путь к репозиторию проекта на сервере, например `/workspace/projects/{slug}` (**обязательно**; без него Dev Runtime не запустится)
3. Нажми **Сохранить**
4. Укажи **Source branch** (`dev` или `workingBranch`)
5. Нажми **Start** — server-agent поднимет compose-стек и настроит Traefik

### URL dev-окружения для агентов

Когда Dev Runtime активен, runner-агент видит его по внутреннему URL из переменной `AGENT_DEV_RUNTIME_URL` (проставляется платформой автоматически). Используй этот URL для Playwright и curl внутри раннера — Traefik/HTTPS там не нужен.

Пользователь видит публичный URL (`https://dev.{domain}`) в панели **Dev Runtime** проекта в my-core.

---

## 12. Обязательные файлы проекта

Каждый проект под управлением my-core **обязан** иметь в корне репозитория:

### `AGENTS.md`

Руководство для AI-агентов по работе с проектом. Агенты читают его автоматически в начале каждой сессии. Минимальный шаблон:

````markdown
# AGENTS.md

## Команды

```bash
bun install          # зависимости
bun run dev          # dev-сервер
bun run ci:check     # lint + typecheck + test (без сети)
bun run ci:fix       # lint:fix
```

## Менеджер пакетов: только Bun

Использовать только `bun` и `bunx`. npm/yarn/pnpm — запрещены.

## Стек

| Слой | Технология |
|------|-----------|
| Backend | ... |
| Frontend | ... |
| БД | ... |

## Dev Runtime

Dev-окружение управляется платформой my-core.
- Внутренний URL (из раннера): `$AGENT_DEV_RUNTIME_URL`
- Публичный URL: задан в настройках проекта → Dev Runtime

Для UI-тестов используй Playwright MCP с `$AGENT_DEV_RUNTIME_URL`.
Никогда не используй prod URL для browser-действий без явного разрешения пользователя.

## Дизайн

Правила дизайна, палитра, компонентные паттерны — см. [`DESIGN.md`](./DESIGN.md).
Читай `DESIGN.md` перед любыми изменениями UI или компонентов.
````

### `DESIGN.md`

Документ дизайн-системы проекта. Агенты обязаны читать его перед любыми изменениями UI. Минимальный шаблон:

````markdown
# DESIGN.md — Дизайн-система {slug}

## Цветовая палитра

| Токен | Значение | Использование |
|-------|---------|---------------|
| primary | #... | Акцент, CTA-кнопки |
| background | #... | Фон страниц |

## Типографика

- Основной шрифт: ...
- Заголовки: ...

## Компоненты и паттерны

[Ключевые компоненты, правила их использования, что запрещено]

## UI-правила

- ...
````

---

## 13. Чеклист нового проекта

### Сервер (уже выполнено, если my-core работает)

- [ ] `docker network create vds-edge`
- [ ] Server-agent запущен и подключён к my-core

### Репозиторий

- [ ] Определить slug
- [ ] Скопировать `scripts/ci/` и `PROJECT.md` из my-core
- [ ] Создать `AGENTS.md` по шаблону (раздел 12)
- [ ] Создать `DESIGN.md` по шаблону (раздел 12)
- [ ] Реализовать `ci:check` / `ci:fix` / `typecheck` / `test` в каждом `apps/*` и `libs/*`
- [ ] Добавить корневые команды в `package.json` (раздел 3)
- [ ] Создать `docker-compose.yml` для каждого приложения (раздел 8)
- [ ] Создать `docker-compose.dev.yml` в корне (раздел 11) — **обязательно для Dev Runtime**
- [ ] Добавить `dev:up` / `dev:down` / `dev:logs` в корневой `package.json`
- [ ] Создать `.env.example` в корне с нужными переменными; добавить `.env` в `.gitignore`
- [ ] Все `container_name` по схеме `{slug}-{роль}`
- [ ] Traefik labels с уникальными именами роутеров в публичных сервисах
- [ ] `workflow-template.yaml` → `.github/workflows/production.yaml`, заполнить `TODO:`
- [ ] GitHub Secrets и Vars, заполнить `write-deploy-env.sh`

### В платформе my-core

- [ ] Создать проект с правильным slug
- [ ] Создать pipeline с `ciPolicy = { "**": ["bun run ci:check:affected"] }`
- [ ] Подключить GitHub репозиторий
- [ ] В настройках проекта → **Dev Runtime**: выбрать Server Agent, задать **Runtime Repo Path** (абсолютный путь к репозиторию на сервере), задать Source branch
