# Graphify Local Bootstrap

Эта инструкция нужна для новой машины или агента, который впервые открывает репозиторий. `graphify-out/` генерируется локально, игнорируется Git и не должен коммититься.

## 1. Синхронизировать репозиторий

```powershell
cd C:\Users\Admin\Desktop\WORK\vpn
git fetch origin
git status --short --branch
git pull --rebase origin master
```

Если `pull --rebase` остановился на конфликтах:

```powershell
git status
```

Разреши конфликты в исходниках вручную, затем продолжи rebase:

```powershell
git add <resolved-files>
git rebase --continue
```

Если конфликтует или мешает `graphify-out/`, `.codex/` или другой локальный generated-артефакт, его можно удалить или перенести в сторону и затем пересоздать Graphify заново.

## 2. Установить Graphify CLI

CLI-команда называется `graphify`, Python-пакет называется `graphifyy`.

Через `uv`:

```powershell
uv tool install --upgrade graphifyy
graphify --help
```

Или через Python/pip:

```powershell
python --version
python -m pip install --user --upgrade graphifyy
graphify --help
```

Если PowerShell не видит `graphify` после pip-установки, перезапусти терминал и проверь, что пользовательская папка Python Scripts есть в `PATH`.

## 3. Подключить Graphify к Codex на этой машине

Выполни из корня репозитория:

```powershell
graphify install --platform codex
graphify install --platform codex --project
```

Команда ставит skill/инструкции для Codex. Локальные хуки и `.codex/`-файлы являются machine-local и не коммитятся.

Для полной semantic extraction нужен LLM backend. Обычно достаточно одного из ключей:

```powershell
$env:GEMINI_API_KEY = "<key>"
# или
$env:GOOGLE_API_KEY = "<key>"
```

Без LLM-ключа команда `graphify update .` все равно пересобирает code graph через AST и подходит как локальный baseline. Полная extraction по смешанному code/docs корпусу может попросить LLM-ключ.

## 4. Выполнить первую генерацию

Из корня репозитория:

```powershell
$env:PYTHONIOENCODING = "utf-8"
graphify update .
```

Проверь, что появились основные файлы:

```powershell
Test-Path graphify-out\graph.json
Test-Path graphify-out\GRAPH_REPORT.md
Test-Path graphify-out\graph.html
```

Для полного semantic run через Codex можно после установки skill-а написать агенту:

```text
/graphify .
```

Если полный запуск остановится на отсутствии LLM-ключа, задай `GEMINI_API_KEY`/`GOOGLE_API_KEY` или оставь `graphify update .` как локально сгенерированный baseline до появления ключа.

## 5. Проверить, что Graphify отвечает

```powershell
graphify query "Как устроены платежи и подтверждение почты?"
graphify explain "TBank"
```

Для связи между двумя концептами:

```powershell
graphify path "payments" "email verification"
```

## Готовая инструкция для агента на другой машине

```text
Работай в корне репозитория vpn. Сначала выполни:

git fetch origin
git status --short --branch
git pull --rebase origin master

Если будут конфликты, разреши их вручную, затем `git add <resolved-files>` и `git rebase --continue`. Не коммить `graphify-out/`, `.codex/`, `output/` и другие локальные generated-файлы. Если `graphify-out/` или `.codex/` мешают pull/rebase, удали или перенеси их и потом пересоздай.

Дальше установи Graphify:

uv tool install --upgrade graphifyy

Если uv недоступен, используй:

python -m pip install --user --upgrade graphifyy

Проверь `graphify --help`, затем из корня репозитория выполни:

graphify install --platform codex
graphify install --platform codex --project
$env:PYTHONIOENCODING = "utf-8"
graphify update .

Проверь, что существуют `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md` и `graphify-out/graph.html`. После этого проверь запросом:

graphify query "Как устроены платежи и подтверждение почты?"

Если нужен полный `/graphify .` semantic run и он попросит LLM-ключ, задай `GEMINI_API_KEY` или `GOOGLE_API_KEY`, либо оставь `graphify update .` как локальный baseline.
```
