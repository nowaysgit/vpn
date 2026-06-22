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

## Дизайн

Перед изменениями UI читать `DESIGN.md`. Интерфейс должен быть рабочим продуктовым экраном, не лендингом.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
