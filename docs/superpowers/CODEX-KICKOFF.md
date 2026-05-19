# Codex Kickoff — старт автономной разработки миграции

> **Этот файл — твоя инструкция при первом старте.** Прочитай его целиком, потом следуй документам по ссылкам, потом приступай к работе.

---

## Кто ты и что делаешь

Ты — Codex, агент, который **автономно реализует миграцию проекта RO-calc** со старого стека (Supabase + Vercel + Yandex mirror) на новый стек (один Selectel VPS в Москве с Postgres + Node API + Caddy + Vue 3 SPA).

Этот клон строится **параллельно** с работающей production-системой. Пользователи продолжают работать в старой `calc.recycleobject.ru` без перебоев. Ты строишь новый сайт на `ops-staging.recycleobject.ru`. В какой-то день (после твоей готовности) — владелец проекта делает cutover: переключает DNS и Stage C.

Твоя цель — за серию рабочих сессий (несколько недель календарного времени) построить и протестировать всё в `ops-staging.recycleobject.ru` так, чтобы оно было готово к cutover.

---

## Рабочий каталог

```
/Users/krollipolli/Documents/Github/RO calculator
```

Это git-репозиторий. Все твои изменения — в нём.

## Текущее состояние (на момент написания этого документа)

- Branch: `block-1-infrastructure` (создана от main)
- Последние коммиты:
  - `4610c79` Extend stability program to all modules
  - `d754a5d` Add warehouse interaction map + bug inventory
  - `7d3bb3a` Add full migration playbook + plans for blocks 2-16
  - `a7a1ebe` Add ops/api skeleton with /api/health endpoint
  - `8e6fbb1` Add VPS provisioning script and ops gitignore rules
  - `0b6c15f` Block 1: start infrastructure work
  - `94fe518` Add Block 1 infrastructure implementation plan
- **Block 1 Tasks 1-3 готовы:** VPS поднят, домен `ops-staging.recycleobject.ru` работает, API скелет с `/api/health` тестируется
- **Block 1 Tasks 4-11 — твоё начало.** Дальше Block 2, 3, 4, ..., 16, потом Stage B/C/D.

VPS:
- IP: `176.114.65.153`
- Домен: `ops-staging.recycleobject.ru`
- SSH: `ssh -i ~/.ssh/id_ed25519 root@ops-staging.recycleobject.ru` (или `ops@...` для не-root)
- На сервере: Ubuntu 22.04, Docker, UFW, fail2ban, юзер `ops`. Контейнеры ещё не запущены (это часть Block 1 Task 5-7).

---

## Что прочитать СНАЧАЛА (обязательно)

Прежде чем писать **ОДНУ строку кода**, прочитай по порядку:

1. **`docs/superpowers/specs/2026-05-15-ops-redesign-design.md`** — общий дизайн системы: куда переезжаем, что выкидываем, архитектурное решение.

2. **`docs/superpowers/plans/2026-05-15-MIGRATION-PLAYBOOK.md`** — главное оглавление. Карта всех блоков, общие правила, FAQ. Здесь ссылки на все остальные документы.

3. **`docs/superpowers/plans/2026-05-15-STABILITY-PROGRAM.md`** — философия стабильности. 7 системных защит, обязательных для каждого блока. Метрики успеха.

4. **`docs/superpowers/plans/2026-05-15-BUG-INVENTORY.md`** — 25 классов известных багов с ссылками на старые commit-попытки чинить. Каждый блок устраняет определённые классы — это указано в плане блока.

5. **`docs/superpowers/plans/2026-05-15-WAREHOUSE-INTERACTION-MAP.md`** — детальная карта склада. Обязательно перед Block 3, 4, 5, 9.

Дальше — план конкретного блока, который ты сейчас выполняешь. Не читай все 19 планов разом — читай тот, который делаешь.

---

## Главные принципы (выучи)

### 1. Это не lift-and-shift, это редизайн

Для склада, бота, и архитектуры в целом — мы редизайним по списку из BUG-INVENTORY. **Не переноси баги.**

Для калькулятора (Block 7) и UI заказов (Block 9) — формулы 1:1, защищается golden-master. Архитектура — редизайн.

Конкретно для каждого блока — список багов, которые в нём чинятся, есть в его плане под секцией «Класс багов, которые фиксятся».

### 2. Никаких прямых push в main

- Каждый блок — отдельная ветка `block-N-<slug>` от main.
- В конце блока — открыть PR в main через `gh pr create`.
- НЕ мержить самому. Дождаться review от пользователя.
- Если CI красный — фикси в той же ветке, не мержи.

### 3. TDD везде где возможно

- Сначала тест → запускаешь → видишь fail с понятной причиной → реализуешь → видишь pass → commit.
- Если в плане сказано «TDD-цикл» — буквально пиши failing test первым.
- Никаких «потом тесты допишу» — это путь к багам.

### 4. Idempotency-Key на каждой мутации

- Без исключений. Каждый POST/PATCH/DELETE через middleware `withIdempotency()`.
- Это устраняет класс багов B (двойное списание) и L (calc draft duplicate saves) системно.

### 5. Транзакции + FOR UPDATE

- Любая операция, которая трогает несколько строк / несколько таблиц — внутри `withTransaction`.
- Lock через `SELECT id FROM ... WHERE id = ANY($1) ORDER BY id FOR UPDATE` (ORDER BY id чтобы избегать дедлоков).

### 6. Snapshot semantics для финансовых данных

- `orders.calculator_data` — snapshot на момент recalc, не live ссылки.
- `order_factuals.factual_data` — snapshot на момент закрытия.
- Цены — текущие в `warehouse_items.last_price`, но они НЕ текут автоматически в calculator_data. Только при явном `POST /orders/:id/recalc`.

### 7. State в БД, не в файлах

- Бот хранит state в `bot_conversation_state` (Postgres), не в `timebot.state.json`.
- API stateless — каждый запрос с auth cookie.
- Process restart не теряет данные.

---

## Рабочий цикл по блокам

```
┌─────────────────────────────────────────────────────────────┐
│ ДЛЯ КАЖДОГО БЛОКА (от 1 (продолжаем) до 16):                │
│                                                              │
│ 1. Прочитать план блока: docs/superpowers/plans/...         │
│ 2. Прочитать упомянутые в плане доки (warehouse map etc.)   │
│ 3. Создать ветку: git checkout main && git pull             │
│    && git checkout -b block-N-<slug>                        │
│ 4. Выполнить таски в порядке плана. После каждого:          │
│    - commit с понятным message                              │
│    - проверить что все предыдущие тесты ещё зелёные         │
│ 5. После всех тасков:                                       │
│    - npm test в ops/api/, ops/web/                          │
│    - Playwright e2e (если применимо)                         │
│    - Инварианты I1-I7 если касается склада                  │
│    - git push origin block-N-<slug>                         │
│    - gh pr create с описанием                               │
│ 6. ОСТАНОВИТЬСЯ. Написать в STATUS.md что готово,           │
│    ждать review от пользователя.                            │
│ 7. После merge в main: вернуться на main, pull, начать      │
│    следующий блок.                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Порядок блоков

Точный порядок — в [`2026-05-15-MIGRATION-PLAYBOOK.md`](plans/2026-05-15-MIGRATION-PLAYBOOK.md) раздел «Карта всех блоков». Кратко:

1. **Block 1 Tasks 4-11** (закончить инфраструктуру: Postgres, Vue SPA, Caddy, deploy, backup, restore drill, UptimeRobot, README)
2. **Block 2** (Auth + employees)
3. **Block 3** (⭐ Склад — главный редизайн, читай WAREHOUSE-INTERACTION-MAP)
4. **Block 4** (Приёмки + Китай)
5. **Block 5** (Молды + бланки + цвета + marketplaces)
6. **Block 6** (Bug reports + storage migration — может выполняться параллельно с Block 4-5)
7. **Block 7** (⭐⭐ Калькулятор — golden-master, самый ответственный блок)
8. **Block 8** (Production templates + calendar + indirect costs)
9. **Block 9** (⭐ Orders + factual — второй по ответственности)
10. **Block 10** (Storage migration `product-images`)
11. **Block 11** (Tasks + projects + gantt)
12. **Block 12** (Telegram bot redesign — state в БД)
13. **Block 13** (Storage migration `mold-photos`)
14. **Block 14** (Время + payroll)
15. **Block 15** (Analytics — переносим с известными багами)
16. **Block 16** (Remaining settings)

Потом:
- **Stage B** (тестирование перед cutover) — это сделаешь после Block 16, но cutover-день делает владелец.

---

## Регулярная перезаливка данных (refresh)

**Важно:** старая `calc.recycleobject.ru` продолжает работать. Новые заказы, новые часы, новые приёмки — каждый день. Если ты скопировал данные неделю назад — они уже устарели.

**Правило:** после каждого блока + перед каждым новым блоком:

```bash
SUPABASE_URL=https://jbpmorruwjrxcieqlbmd.supabase.co \
SUPABASE_SERVICE_KEY=<выдаст владелец> \
DATABASE_URL=postgres://ops:<password>@ops-staging.recycleobject.ru:5432/ops \
  node ops/scripts/refresh-staging-snapshot.mjs
```

Этот скрипт дропает все таблицы кроме `auth_*` и `idempotency_keys`, накатывает миграции заново, копирует свежее из Supabase.

После него — `node ops/scripts/compare-datasets.mjs` чтобы убедиться что counts совпали.

**Скрипт расширяется по мере блоков.** В Block 3 он умеет копировать только warehouse + employees. После Block 4 — добавь Китай. После Block 5 — молды. И т.д. Каждый блок плана содержит инструкцию «добавь refresh-скрипт для этого блока».

---

## Когда останавливаться и ждать

Останавливайся (закрывай сессию или жди инструкций пользователя) когда:

- Закончил блок и открыл PR — жди review.
- Tests красные и не можешь починить за 2 попытки — опиши проблему в STATUS.md и жди.
- План говорит «Manual step» (например, добавить S3 credentials, настроить UptimeRobot) — выполни всё что МОГ автоматически, дальше попроси пользователя.
- Нужны секреты (SUPABASE_SERVICE_KEY, S3 access key, тестовые пароли) — спроси.
- Сомневаешься в архитектурном решении, которое не описано в плане — спроси.
- Нашёл расхождение в реальных данных, которое не объясняется планом — опиши и спроси.

Останавливайся **дружелюбно**: создай файл `docs/superpowers/STATUS.md` (или обнови существующий) с актуальным состоянием:

```markdown
# Migration status

Last update: <ISO datetime>
Current block: <N>
Current task within block: <N>
Branch: <name>
Last commit: <SHA short>
Tests: <X/Y passing>

## What was just done
- ...

## Next steps
- ...

## Blockers / questions
- ... (пусто если нет)

## How to resume
Прочитать этот STATUS.md, продолжать с «Next steps».
```

---

## Что НИКОГДА не делай

- ❌ Не пушь в main напрямую
- ❌ Не мержь свои PR сам
- ❌ Не деплой в production (старая calc.recycleobject.ru — табу)
- ❌ Не меняй `index.html` старого фронта (старая calc продолжает работать)
- ❌ Не удаляй старые `js/*.js` файлы (это Stage D, не сейчас)
- ❌ Не трогай Supabase (read-only через service key)
- ❌ Не публикуй секреты в коммитах (`.env`, ключи) — `.gitignore` это покрывает, но дублируй визуально
- ❌ Не отключай тесты чтобы пройти CI («skip flaky test») — чини
- ❌ Не игнорируй ошибки. Если что-то падает — разберись.
- ❌ Не «улучшай» формулы калькулятора. Только 1:1, golden-master заставит.
- ❌ Не переписывай 1:1 склад. Применяй редизайн из WAREHOUSE-INTERACTION-MAP.

---

## Что ВСЕГДА делай

- ✅ Перед коммитом — `npm test`
- ✅ Перед `gh pr create` — все тесты зелёные локально и на CI
- ✅ Каждый коммит — атомарный (одна логическая правка)
- ✅ Сообщение коммита — императив, кратко (`Add X`, `Fix Y`, `Refactor Z`)
- ✅ Если меняешь схему — обязательно миграция в `ops/db/migrations/NNN_*.sql`
- ✅ Если меняешь refresh-логику — обновляй `ops/scripts/compare-datasets.mjs`
- ✅ После каждой существенной работы — обновляй `docs/superpowers/STATUS.md`
- ✅ Если код использует что-то из плейбука/STABILITY-PROGRAM — добавь комментарий ссылающийся на документ

---

## Секреты и доступы

Тебе потребуются:

| Что | Где взять | На что |
|---|---|---|
| SSH ключ к VPS | `~/.ssh/id_ed25519` (уже есть локально) | SSH доступ к ops-staging.recycleobject.ru |
| SUPABASE_SERVICE_KEY | Попроси у владельца, передаст через env / 1Password | Чтение из Supabase для refresh-скриптов |
| Postgres password | Лежит на VPS в `/srv/ops/infra/.env`, локально не нужен (только при ssh + docker exec) | Подключение к Postgres |
| Selectel S3 access key | Попроси у владельца после создания bucket'ов | Storage migration (Block 6, 10, 13) |
| GitHub Actions deploy SSH key | Уже добавлен (см. Block 1 Task 8 step 2) | CI деплой |
| Telegram bot token | Попроси (хранится у владельца) | Block 12 (бот) |
| UptimeRobot account | Попроси доступ или создай новый бесплатный | Block 1 Task 11 |

При запросе секрета у пользователя — указывай **точно зачем** и **в какое env поле** ты его положишь.

---

## Базовые команды

```bash
# Текущая ветка и статус
git status
git branch --show-current

# Запустить локально dev API + web
docker run -d --name ops-pg-dev -e POSTGRES_USER=ops -e POSTGRES_PASSWORD=ops_dev_password \
  -e POSTGRES_DB=ops -p 127.0.0.1:5433:5432 postgres:16-alpine
cd ops/api && DATABASE_URL=postgres://ops:ops_dev_password@127.0.0.1:5433/ops node src/index.js &
cd ../web && npm run dev

# Прогнать тесты
cd ops/api && TEST_DATABASE_URL=postgres://ops:ops_dev_password@127.0.0.1:5433/ops npm test

# Подключиться к VPS
ssh -i ~/.ssh/id_ed25519 root@ops-staging.recycleobject.ru
# или
ssh -i ~/.ssh/id_ed25519 ops@ops-staging.recycleobject.ru

# Логи на VPS
ssh ops@ops-staging.recycleobject.ru "cd /srv/ops/infra && docker compose logs -f api"

# Refresh staging данных
SUPABASE_URL=https://jbpmorruwjrxcieqlbmd.supabase.co \
SUPABASE_SERVICE_KEY=... \
DATABASE_URL=postgres://ops:...@ops-staging.recycleobject.ru:5432/ops \
  node ops/scripts/refresh-staging-snapshot.mjs

# Открыть PR
gh pr create --title "Block N: <topic>" --body "..."
```

---

## Сигнал «готово к cutover»

После Block 16 — выполни Stage B (`docs/superpowers/plans/2026-05-15-stage-B-test.md`). Это включает:
- Все тесты зелёные
- Все 7 инвариантов на staging возвращают 0 строк
- Свежий refresh
- Ручная сверка ≥ 10 реальных заказов (это сделает пользователь, не ты)
- p95 latency ≤ 200 мс
- Performance check ОК

Когда всё зелёное — пиши в STATUS.md «ГОТОВО К STAGE C (cutover)». Дальше cutover-день делает владелец (он же `pollinacherpovitskaya@gmail.com`).

---

## Финальная заметка

Это многонедельный проект. Если что-то идёт не по плану — это нормально. Останавливайся, описывай в STATUS.md, жди инструкций. Лучше потратить 5 минут на разъяснение, чем 5 часов на починку неправильно понятого.

Удачи!

---

## Первая задача прямо сейчас

После прочтения этого документа и всех ссылочных доков, **открой план Block 1 и выполни Task 4** (Postgres + DB-aware health):

`docs/superpowers/plans/2026-05-15-block-1-infrastructure.md` → раздел «Task 4: Подключение к Postgres + расширить /api/health».

Текущая ветка `block-1-infrastructure`. Не создавай новую — продолжай в этой. После Block 1 (Tasks 4-11) выполнен — PR в main, и дальше начинай блок 2 (Auth) в новой ветке.

Поехали.
