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

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
