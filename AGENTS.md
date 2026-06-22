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

## Локальный доступ к удалённым my-core MCP tools

Удалённые MCP-инструменты my-core доступны локально через единый сайт:

`https://app.my-core.ru`

CLI для доступа подключается через общий submodule:

`tools/my-core-mcp`

Авторизация одна на все проекты пользователя. Локальный токен хранится на машине пользователя в:

`~/.my-core/local-mcp.json`

Это единственный локальный auth-файл для всех проектов на этой Windows-машине. Не создавай auth-файлы внутри репозиториев и не добавляй project-local пути для MCP-токена.

Файл должен иметь права `0600`. Значение токена нельзя печатать в логи, task comments, artifacts, prompt snapshots, screenshots или CI output.

### Требования

- Использовать только Bun: `bun` / `bunx`
- В проекте должен быть submodule `tools/my-core-mcp`
- Если submodule не загружен, выполнить `git submodule update --init --recursive tools/my-core-mcp`
- Использовать CLI только из `tools/my-core-mcp/local-mcp.ts`
- Не копировать `local-mcp.ts` в `scripts/`; source of truth — `https://github.com/nowaysgit/my-core-mcp.git`
- Скрипт не должен поддерживать project-local auth path: локально используется только `~/.my-core/local-mcp.json`, в runner/container — только общий env контейнера

### Режимы работы

Локальная разработка использует device-code login и один machine-wide файл `~/.my-core/local-mcp.json`, общий для всех локальных проектов.
Runner/container использует уже переданные env-переменные контейнера, общие для всех managed projects в этом runner, и не должен выполнять `login`.

Для runner/container достаточно env:

```text
MY_CORE_BACKEND_URL или MY_CORE_MCP_BASE_URL
MY_CORE_AGENT_ID или MY_CORE_MCP_AGENT_ID
MY_CORE_RUNNER_TOKEN или MCP_API_KEY или MY_CORE_MCP_TOKEN
```

`config` сам выбирает bearer env var:

- локально после `login` - `MY_CORE_MCP_TOKEN`
- в runner/container - существующий `MY_CORE_RUNNER_TOKEN`, `MCP_API_KEY` или `MY_CORE_MCP_TOKEN`

### Инициализация локально

```bash
bun run tools/my-core-mcp/local-mcp.ts login --server https://app.my-core.ru
```

Команда выведет URL вида:

```text
https://app.my-core.ru/mcp/authorize?code=...
```

Открой URL в браузере, войди обычным аккаунтом на сайте и подтверди код.

После подтверждения CLI сохранит локальный токен в:

```text
~/.my-core/local-mcp.json
```

### Подключение MCP tools к локальному клиенту

Linux/macOS/Git Bash:

```bash
eval "$(bun run tools/my-core-mcp/local-mcp.ts env --shell bash)"
```

Windows PowerShell:

```powershell
Invoke-Expression (bun run tools/my-core-mcp/local-mcp.ts env --shell powershell)
```

Печать MCP config одинакова для всех проектов и окружений:

```bash
bun run tools/my-core-mcp/local-mcp.ts config
```

`config` печатает JSON с MCP servers:

- `database` - задачи, знания, проекты, вехи и связанные DB tools
- `system` - статус System Core и диагностические read tools
- `tools` - разрешённые runtime/dev tools
- `cicd` - разрешённые CI/CD tools

Секрет не встраивается в MCP config. Клиент должен передавать bearer через переменную окружения, указанную в `bearer_token_env_var`.
Для локальной разработки это обычно:

```text
MY_CORE_MCP_TOKEN
```

### Повторная авторизация и проверка

```bash
bun run tools/my-core-mcp/local-mcp.ts status
bun run tools/my-core-mcp/local-mcp.ts login --server https://app.my-core.ru
```

### Отзыв доступа

Токен можно отозвать через сайт или API:

```http
DELETE /v1/local-mcp/tokens/:id
```

### Правила безопасности

- Не коммитить `~/.my-core/local-mcp.json`
- Не вставлять токен в `AGENTS.md`, `README`, CI variables dump, логи или screenshots
- Не использовать `/v1/auth/login` для системных операций
- Для локальных MCP tools использовать только device-code flow через `tools/my-core-mcp/local-mcp.ts login`
- В runner/container не создавать `~/.my-core/local-mcp.json`; использовать только переданные env-переменные
- Не добавлять `--config`, `--auth-file`, `MY_CORE_LOCAL_MCP_CONFIG` или другие project-local auth overrides
- Обновлять CLI через submodule commit `tools/my-core-mcp`, а не копировать файл между проектами

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

### Локальный dev-режим

- **Фронтенд запускай локально через Bun**, а не в Docker:

  ```bash
  bun install
  bun run --cwd apps/customer-web dev
  bun run --cwd apps/admin-web dev
  ```

  Лендинг и клиентский кабинет доступны на `http://127.0.0.1:3000`, admin-web — на `http://127.0.0.1:3002`.

- **Backend и PostgreSQL запускай через Docker Compose**:

  ```bash
  docker compose -f docker-compose.dev.yml up -d postgres api
  docker compose -f docker-compose.dev.yml logs -f api
  ```

  Не запускай `customer-web` в Docker в локальном dev-режиме — он должен работать из локального процесса Bun.

## Дизайн

Перед любыми изменениями UI обязательно читать `DESIGN.md`. Любая страница, компонент и состояние должны соблюдать его токены, типографику, отступы, адаптивность, доступность и правила использования Spotify Green. Не хардкодить цвета, тени и типографику в компонентах — использовать семантические Tailwind-токены из дизайн-системы.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## UI-компоненты и стили

- **Сначала shadcn-vue.** Перед созданием любого UI-элемента проверь `app/components/ui`. Если подходящий компонент shadcn-vue существует, используй его вместо локального аналога: `Button`, `Card`, `Input`, `Select`, `Field`, `Table`, `Badge`, `Alert`, `Sheet`, `Dialog`, `Tabs`, `Separator` и т. п.
- Компоненты `app/components/ui` добавляй и обновляй только через shadcn-vue CLI. Не копируй их исходники вручную и не создавай дубликаты кнопок, инпутов, карточек, статусов, модалок, таблиц или навигационных примитивов вне этой папки.
- `app/components/ui` — общий UI-слой конкретного приложения. Продуктовые, составные секции декомпозируй в `app/components/<feature>/`; они должны собирать интерфейс из `components/ui`, а не реализовывать свои базовые контролы.
- Используй Tailwind CSS для всех стилей страниц и продуктовых компонентов. Применяй mobile-first breakpoints и семантические классы токенов: `bg-primary`, `text-muted-foreground`, `border-border`, `bg-card`, `text-destructive` и т. п.
- `app/assets/css/main.css` содержит только импорты Tailwind/shadcn-vue, CSS design tokens, настройку темы и базовый reset. В нём запрещены стили конкретных страниц, секций и локальных компонентов.
- Не использовать самописные глобальные классы наподобие `.button`, `.card`, `.panel`, `.input`, `.status`, `.page` или `.topbar`. Удаляй локальные аналоги при миграции на shadcn-vue.
- Перед завершением UI-изменений проверяй desktop и mobile в реальном браузере, а также запускай релевантные `bun`-проверки.
