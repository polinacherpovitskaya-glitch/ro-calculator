# Full Migration Off Supabase + Vercel — Design Spec

## Problem

`calc.recycleobject.ru` живёт на Vercel + Supabase. Сервер за рубежом, доступ из РФ нестабильный. `calc2.recycleobject.ru` — статичное зеркало на Yandex Object Storage с проксированием Supabase через Yandex API Gateway. Результат:

- Сотрудница в России — основной пользователь склада — не может надёжно работать. Сохранения "висят", списания фурнитуры теряются или дублируются, после reload видны старые цифры.
- В коде наращён 5-уровневый fallback-каскад (dirty-cache → static bootstrap до 30 минут устаревший → live bootstrap → Supabase напрямую → snapshot в `settings` → локальный кэш). Каждый шаг ждёт таймаут перед следующим — отсюда тормоза.
- История коммитов за месяцы — сплошное тушение пожаров от calc2 cache/recovery. Корневая причина не лечится.

Корневая проблема: **данные физически далеко от ключевого пользователя**, и поверх этого построены всё более сложные обходы вместо того, чтобы переместить данные ближе.

## Goals

- Сохранение в складе/заказах занимает миллисекунды, не секунды.
- Никаких "висит при сохранении", "после reload видны старые данные", "списалось дважды".
- Один источник истины, один путь данных. Никаких параллельных снапшотов разной свежести.
- **Полное отключение Supabase и Vercel** после миграции. Всё хостится в России, на одном провайдере.
- Бюджет в финальной точке: ≤$15/мес вместо текущих $25–45/мес.
- Калькулятор и заказы переезжают **бит-в-бит** — ни одна цифра не должна разойтись.

## Constraints

- **Разработка ведётся через Claude Code единственным владельцем проекта (не командой программистов).** Сроки измеряются в "сессиях Claude Code" + календарном времени, не в "человеко-неделях штатной разработки".
- **Пользователи (сотрудники) продолжают работать в существующей системе до самого момента переключения.** Никаких "сейчас неделю работаем в новой, проверяем" в их рабочем потоке. Тестируем сами на копии данных.
- **Cutover — один момент.** Не модуль за модулем, а: "сегодня все логинятся в старую calc; завтра все логинятся в новую". Старая остаётся в read-only безопасной сетке N дней после переключения.

## Non-Goals

- Не переписываем UI/UX. Структура страниц и логика — как сейчас, только на новом стеке.
- Не пишем мобильное приложение, PWA-режим, push-уведомления.
- Не делаем оффлайн-режим / local-first sync.
- Не интегрируем новые внешние сервисы (только переносим существующие).
- Не нормализуем схему БД. Структура таблиц переезжает как есть; улучшения схемы — отдельным проектом потом.

## Approach

**Подход A — Всё в одном Selectel VPS.** Один Cloud Server в Москве, в нём в Docker крутятся Postgres + Node API + Caddy. Новое маленькое SPA на Vue 3 покрывает все нужные модули. Storage buckets (фото) переезжают в Selectel Object Storage. По завершении миграции — Supabase и Vercel отключаются.

Отвергнутые альтернативы:

- **Yandex Cloud managed services** — архитектурно идентично, но ~5000–8000 ₽/мес против ~500–800 ₽/мес у VPS. На нашем масштабе (≤10 активных пользователей, БД <3 ГБ) managed не оправдан.
- **Хирургическая правка существующего** — не лечит корневую причину. Данные остаются далеко, fallback-каскад не решает геолокацию.
- **Local-first PWA + sync** — добавляет sync-движок и класс багов "а это уже синхронизировалось?". При нашем профиле использования не оправдано.

## Architecture

```
┌─────────────────────────┐
│  Браузер пользователей  │
│  (Vue 3 SPA)            │
└──────────┬──────────────┘
           │ HTTPS (~30 ms из Москвы)
           ▼
┌─────────────────────────┐
│  Selectel VPS в Москве  │
│  ┌───────────────────┐  │
│  │ Caddy             │  │ ← TLS (Let's Encrypt автоматом)
│  │ - serves SPA      │  │   reverse proxy /api → Node
│  │ - reverse proxy   │  │
│  └─────────┬─────────┘  │
│            │            │
│  ┌─────────▼─────────┐  │
│  │ Node 20 API       │  │ ← Express, REST, JSON
│  │ (Express)         │  │   ~1 ms до Postgres
│  └─────────┬─────────┘  │
│            │            │
│  ┌─────────▼─────────┐  │
│  │ PostgreSQL 16     │  │ ← единственный источник истины
│  │                   │  │
│  └───────────────────┘  │
│                         │
│  ┌───────────────────┐  │
│  │ Telegram task bot │  │ ← отдельный Node-процесс,
│  │ (Node 20)         │  │   читает/пишет в тот же Postgres
│  └───────────────────┘  │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Selectel Object Storage │ ← фото (product-images, mold-photos,
│ (S3-compatible)         │   bug-attachments) + ночные pg_dump
└─────────────────────────┘

Старая calc.recycleobject.ru (Vercel + Supabase) живёт во время
миграции в read-only, после Фазы 7 — выключается насовсем.
```

**Ключевые свойства:**
- Один путь данных. Никаких bootstrap'ов, fallback'ов, снапшотов в settings.
- БД и API на одной машине — задержка между ними миллисекунды.
- VPS в Москве — задержка до пользователей 20–50 мс.
- TLS, бэкапы, рестарты, мониторинг — автоматизировано.

## Tech Stack

- **Хостинг:** Selectel Cloud Server, регион Москва (`ru-7` или `ru-9`). Старт: 2 vCPU / 2 GB RAM / 30 GB NVMe. Готовы к hot-resize до 4 vCPU / 4 GB при росте нагрузки.
- **OS:** Ubuntu 22.04 LTS
- **Container:** Docker + docker-compose
- **Database:** PostgreSQL 16
- **API:** Node.js 20, Express 4, `pg` driver, `argon2` для паролей
- **Static / TLS / reverse proxy:** Caddy 2 (автоматический Let's Encrypt)
- **Frontend:** Vue 3 + Vite + Pinia + TypeScript
- **Telegram bot:** существующий Node-процесс из `bot/`, переключённый на новый Postgres
- **Тесты:** Node native test runner (unit), Playwright (e2e), golden-master snapshots для расчётов
- **CI/CD:** GitHub Actions → SSH-деплой на VPS (rsync + `docker compose up -d`)
- **Бэкапы:** systemd timer → ежедневный `pg_dump` → Selectel Object Storage (S3, retention 30 дней)
- **Мониторинг:** UptimeRobot (бесплатный) пингует `/api/health` → email/Telegram при падении

**Структура нового кода:** новый каталог `ops/` в текущем монорепозитории:
- `ops/api` — Node API
- `ops/web` — Vue 3 SPA
- `ops/bot` — переезд `bot/` сюда (если решаем оставить в одном репо)
- `ops/db` — миграции, seed
- `ops/infra` — docker-compose, Caddyfile, deploy скрипты, бэкап скрипты

## Modules — In and Out

### Переносим полностью (с высоким качеством, "1:1")

| Модуль | Текущая страница | Таблицы | Критичность |
|---|---|---|---|
| Auth + employees | (login) | employees + новые auth_users/sessions | Critical |
| Калькулятор | calculator | product_templates + расчёт-функции в JS | **Critical 1:1** |
| Заказы + КП | orders, order-detail | orders, order_items, order_factuals | **Critical 1:1** |
| Factual (фактические) | factual | order_factuals + finance.factualSnapshots | High |
| Склад | warehouse | warehouse_items, warehouse_reservations, warehouse_history | Critical |
| Приёмки | (внутри warehouse) | shipments | Critical |
| Китай-закупки | china | china_purchases, china_orders | Critical |
| Китай-каталог | china_catalog | (JSON + Supabase) | High |
| Молды | molds | molds, hw_blanks, pkg_blanks | High |
| Бланки | (внутри molds + settings) | hw_blanks, pkg_blanks | **High** |
| Цвета | colors | app_colors | Medium |
| Marketplaces (Битуси) | marketplaces | marketplace_sets | High |
| ТПА — только live calc | tpa (частично) | (расчёт) | Medium |
| Production calendar | (внутри orders) | settings.productionCalendar | High |
| Production plan | production-plan | (JSON в settings) | High |
| Indirect costs | (внутри settings/calc) | settings.indirectCosts | High |
| Время | timetrack | time_entries, app_vacations | High |
| Payroll | (внутри settings) | settings.payroll | High |
| Tasks | tasks | tasks, task_comments, task_checklist_items, task_watchers, task_notification_events, work_assets, work_activity | Medium |
| Projects + areas | projects | projects, areas | Low |
| Gantt | gantt | (use tasks/projects) | Low |
| Bug reports | bugs | bug_reports + bug-attachments | Medium |
| Analytics | analytics | (use orders, factuals, time) | Medium |
| Telegram task bot | (отдельный процесс) | использует tasks/time | Medium |
| Storage buckets | — | product-images, mold-photos, bug-attachments | High |

### Полностью выбрасываем

- **Wiki** — не используется, заменено Notion'ом
- **ТПА** (всё кроме встроенного калькулятора) — не используется
- **Monitoring** (internal dashboard) — не используется
- **Finance UI** (все экраны "Финансы") — артефакт переездов, в зачаточном состоянии, не используется
- **FinTablo import pipeline** — следствие выкидывания финансового UI
- **Bank integration** (`bank_*` таблицы и логика) — следствие
- **Legacy finance** (`legacy_finance_*` таблицы) — следствие
- Соответствующий код в `js/finance.js`, `js/fintablo.js`, `js/indirect_costs.js` (в части finance-зависимостей), `js/import.js` (в части finance) — удаляем

## Data Model

### Переезжает в Selectel Postgres (новый источник истины)

Auth:
- `auth_users`, `auth_sessions`, `idempotency_keys` (новые)
- `employees` (копия из Supabase)

Склад + сорсинг:
- `warehouse_items`, `warehouse_reservations`, `warehouse_history`
- `shipments`
- `china_purchases`, `china_orders`

Производство + товар:
- `molds`, `hw_blanks`, `pkg_blanks`, `app_colors`
- `marketplace_sets`
- `product_templates`

Заказы:
- `orders`, `order_items`, `order_factuals`

Work management:
- `projects`, `areas`
- `tasks`, `task_comments`, `task_checklist_items`, `task_watchers`, `task_notification_events`
- `work_assets`, `work_activity`, `work_templates`
- `bug_reports`

Время:
- `time_entries`, `app_vacations`

Прочее:
- `settings` — целиком, но без ключей, относящихся к выброшенным модулям (`finance_*`, `bank_*`, `wiki_*`)

### НЕ переезжает (выбрасываем)

- `finance_sources`, `finance_accounts`, `finance_categories`, `finance_directions`, `finance_counterparties`
- `finance_transactions`, `finance_transaction_links`
- `finance_rules`, `finance_manual_decisions`
- `bank_sync_runs`, `bank_accounts`, `bank_transactions`
- `legacy_finance_import_runs`, `legacy_finance_transactions`
- `fintablo_imports`
- (соответствующие ключи в `settings`)

### Storage buckets → Selectel Object Storage

- `product-images` → `selectel://ro-prod/product-images/`
- `mold-photos` → `selectel://ro-prod/mold-photos/`
- `bug-attachments` → `selectel://ro-prod/bug-attachments/`

URL в БД обновляются скриптом миграции.

### Очистка по ходу

- Колонка `item_data` JSON в `warehouse_items` — разворачивается в нормальные колонки.
- Snapshot склада в `settings.warehouseItems` — удаляется.
- Все `dirty cache flags` в localStorage клиента — удаляются.
- 5-уровневый fallback в `loadWarehouseItems` — удаляется.

## API Design

REST, JSON, авторизация через HttpOnly cookie `session_id`. Все запросы с фронта идут на `/api/*` через Caddy reverse proxy.

### Группы эндпойнтов

```
/api/auth/*                  логин, logout, me, change-password
/api/employees               справочник
/api/warehouse/*             items, reservations, inventory-audit, history
/api/shipments/*             приёмки
/api/china/*                 purchases, catalog
/api/molds/*                 молды + hardware
/api/blanks/*                hw_blanks, pkg_blanks
/api/colors                  app_colors
/api/marketplaces/*          marketplace_sets
/api/product-templates/*     шаблоны
/api/orders/*                orders, items, factuals, consume-hardware
/api/calc/*                  калькулятор-функции (если выносим на сервер)
/api/production/*            calendar, plan, indirect costs
/api/time/*                  time_entries, vacations, payroll
/api/projects/*              projects, areas
/api/tasks/*                 tasks + comments + checklists + watchers + notifications
/api/bugs/*                  bug_reports + attachments
/api/analytics/*             отчёты
/api/health, /api/version
```

### Идемпотентность

Каждая мутирующая операция (`POST`, `PATCH`, `DELETE`) принимает заголовок `Idempotency-Key: <uuid>`. Сервер:
- Если ключ уже видели → возвращает закэшированный ответ.
- Если ключ новый → выполняет операцию, сохраняет результат в `idempotency_keys` (TTL 24 часа).

Это решает класс багов "пользователь нажал кнопку дважды → списалось дважды" раз и навсегда.

### Ошибки

Единый формат:
```json
{ "error": { "code": "WAREHOUSE_INSUFFICIENT_STOCK", "message": "На складе 5, запрошено 10", "details": { "item_id": 123, "available": 5, "requested": 10 } } }
```

## Frontend

### Стек

Vue 3 + Vite + Pinia + TypeScript. Без SSR — чистая SPA, билдится в `dist/`, Caddy раздаёт.

### Страницы (≈18)

1. Login
2. Calculator
3. Orders list
4. Order editor / KP
5. Factual
6. Warehouse list
7. Warehouse item card + history
8. Shipments
9. China purchases + catalog
10. Molds list + card
11. Blanks (hardware/packaging)
12. Colors
13. Marketplaces
14. Production calendar
15. Production plan + indirect costs
16. Time tracking + payroll
17. Tasks + projects + gantt
18. Bug reports
19. Analytics
20. Settings
21. ТПА calc (live, на одном экране)

### Поведенческие принципы

- **Никакого localStorage для данных.** Кэш только в памяти Pinia. После reload — всё с сервера.
- **Никакого "оптимистичного UI" для записей.** Сохраняем → ждём ответ → меняем UI. ≈30 мс задержки незаметно.
- **Кэш в памяти только для скорости открытия.** При повторном входе в экран показываем последний снимок, параллельно обновляем.
- **Skeleton-loader** при первой загрузке.
- **Явные плашки ошибок.** Если сеть умерла — плашка "не удалось сохранить", кнопка "повторить".
- **Idempotency-Key на каждом POST/PATCH/DELETE.**

## Authentication

- Логин по `email` + паролю.
- Argon2id для хэширования.
- HttpOnly + Secure cookie `session_id`, TTL 60 дней.
- Роли: `admin` (всё), `user` (читать/писать, нельзя удалять).
- Никаких OAuth, magic-links, SMS-кодов.

При миграции для каждого активного сотрудника создаётся `auth_user` с временным паролем, сотрудник меняет при первом входе.

## Migration Plan

**Главный принцип:** "Build → Test → Cutover в один день." Пользователи живут в текущей `calc.recycleobject.ru` весь период разработки и не замечают, что параллельно строится замена. В день переключения — один скоординированный шаг.

Это противоположно "module-by-module with parallel sync". Один-way sync не нужен. Меньше операционного шума, меньше шансов несинхронизованных данных, чище код миграции.

### Структура работы

```
┌────────────────────────────────────────────────┐
│ STAGE A — BUILD                                │
│ Строим новую систему целиком на staging-домене │
│ (например ops-staging.recycleobject.ru).       │
│ Пользователи в это время не трогают её.        │
│ Используем СНАПШОТ Supabase, обновляем регулярно│
│ Длится: всё основное время проекта             │
└──────────────────┬─────────────────────────────┘
                   ▼
┌────────────────────────────────────────────────┐
│ STAGE B — TEST                                  │
│ На скопированных боевых данных:                │
│ - golden-master тесты калькулятора зелёные     │
│ - 20+ реальных заказов: цифры совпадают        │
│ - ручная проверка ключевых сценариев           │
│ - smoke в CI                                    │
│ Длится: 1–2 недели интенсивного тестирования   │
└──────────────────┬─────────────────────────────┘
                   ▼
┌────────────────────────────────────────────────┐
│ STAGE C — CUTOVER DAY                          │
│ Окно в 2-4 часа, желательно вечер/выходной.    │
│ 1. Объявление: "Сегодня в 22:00 переключаемся" │
│ 2. Supabase → read-only (kill-switch в calc)   │
│ 3. Финальный delta-sync Supabase → Postgres    │
│ 4. Сверка row counts и golden-master           │
│ 5. DNS calc.recycleobject.ru → новый SPA       │
│ 6. Smoke в проде                                │
│ 7. Всё. Пользователи завтра логинятся в новую. │
│ Длится: 1 день                                  │
└──────────────────┬─────────────────────────────┘
                   ▼
┌────────────────────────────────────────────────┐
│ STAGE D — SAFETY NET + CLEANUP                 │
│ Supabase + Vercel остаются неделю как safety   │
│ net. Если критическая регрессия — кнопкой      │
│ возвращаемся.                                   │
│ Через неделю спокойной работы — отключаем,     │
│ чистим репо.                                   │
└────────────────────────────────────────────────┘
```

### Stage A — Build (основная часть работы)

Строится модуль за модулем на staging-домене. Ниже — порядок (каждая строка ≈ "независимый блок Claude Code сессий"). После каждого блока — итерация: разработать → проверить на снапшоте данных → пофиксить → следующий блок.

**Блок 1 — Инфраструктура** *(2-3 сессии)*
- Selectel Cloud Server, Docker compose с Postgres + Node + Caddy
- Домен `ops-staging.recycleobject.ru` (TLS Let's Encrypt)
- GitHub Actions deploy на push в `main`
- Ежесуточный `pg_dump` → Selectel Object Storage
- `/api/health` отвечает 200
- Пустой Vue 3 SPA с роутером

**Блок 2 — Auth + employees** *(2-3 сессии)*
- Таблицы `auth_users`, `auth_sessions`, `idempotency_keys`
- Скрипт one-time-копии `employees` из Supabase
- Эндпойнты `/api/auth/*`
- Экран Login + смена пароля
- Middleware авторизации

**Блок 3 — Склад** *(4-5 сессий)*
- Таблицы `warehouse_items` (нормализованные колонки вместо `item_data` JSON), `warehouse_reservations`, `warehouse_history`
- Скрипты копирования данных
- API: items / reservations / history / inventory-audit
- Экраны: список склада, карточка позиции, журнал, инвентаризация
- Идемпотентность на все мутации

**Блок 4 — Приёмки + Китай-закупки + каталог** *(3-4 сессии)*
- `shipments`, `china_purchases`, `china_orders`
- Скрипты копирования
- API + экраны: приёмки, Китай-список, Китай-каталог, форма закупки, форма приёма

**Блок 5 — Молды + бланки + цвета + marketplaces** *(3-5 сессий)*
- `molds`, `hw_blanks`, `pkg_blanks`, `app_colors`, `marketplace_sets`
- API + экраны для каждого

**Блок 6 — Bug reports + storage bucket** *(2-3 сессии)*
- `bug_reports`
- Миграция bucket `bug-attachments` → Selectel Object Storage (скрипт)
- Обновление URL в БД
- API + экран багов

**Блок 7 — ⭐ Калькулятор (главный риск)** *(6-10 сессий)*
- Перед началом: **сбор golden-master snapshots**: 20+ реальных заказов, их входные параметры, ожидаемые total/cost/margin/factual. Snapshot'ы в JSON, в репо.
- Перенос `js/calculator.js`, `js/pendant.js`, `js/factual.js`, `js/colors.js`, нужная часть `js/tpa.js`
- Структура: чистые функции расчёта, изолированные от UI. Тесты гоняют через snapshot'ы.
- Все snapshot'ы должны проходить **байт-в-байт**. Любое расхождение — стоп.
- Vue-компоненты калькулятора

**Блок 8 — Product templates + Production calendar + Production plan + Indirect costs** *(3-4 сессии)*
- `product_templates`
- Production calendar (сейчас в `settings.productionCalendar` — оставляем в settings или выносим в таблицу)
- `production-plan` и `indirect costs` — экраны и расчёты

**Блок 9 — ⭐ Orders + Order items + Factual** *(5-7 сессий)*
- Таблицы и скрипты копирования
- Экран "Заказы" (список со всеми фильтрами)
- Экран "Редактор заказа/КП" (большой)
- Операция "Списать фурнитуру под заказ" + интеграция со складом
- Golden-master тесты для заказов: 20+ снапшотов

**Блок 10 — Storage bucket `product-images`** *(1-2 сессии)*
- Миграция bucket в Selectel S3
- Обновление URL в БД

**Блок 11 — Tasks + Projects + Areas + Gantt** *(4-6 сессий)*
- `projects`, `areas`, `tasks`, `task_comments`, `task_checklist_items`, `task_watchers`, `task_notification_events`, `work_assets`, `work_activity`, `work_templates`
- API + экраны: проекты, задачи (список + карточка), гант

**Блок 12 — Telegram task bot** *(1-2 сессии)*
- Переезд `bot/` в `ops/bot/`
- Замена Supabase-клиента на наш API (или прямой Postgres)
- State переезжает на VPS

**Блок 13 — Storage bucket `mold-photos`** *(1 сессия)*

**Блок 14 — Time + Vacations + Payroll** *(3-4 сессии)*
- `time_entries`, `app_vacations`
- Экран "Время", расчёт зарплат

**Блок 15 — Analytics** *(2-3 сессии)*
- Перенос имеющихся отчётов (с известными багами — фиксируем как issues, не блокеры)

**Блок 16 — Remaining settings** *(1-2 сессии)*
- Оставшиеся ключи `settings`

**Итого Stage A: ~45-70 сессий Claude Code.**

### Stage B — Test (1-2 недели тестирования)

Финальная сверка перед cutover. К этому моменту вся новая система работает на staging с актуальным снапшотом данных.

- **Финальная переливка** Supabase → Postgres делается за 24-48 часов до cutover'а (для проверки скрипта).
- **Golden-master тесты:** все зелёные.
- **Ручная проверка:** идём по чек-листу (создать заказ, посчитать, списать со склада, провести приёмку, начислить зарплату, добавить задачу, переслать в бот и т.п.).
- **Сверка row counts:** для каждой мигрируемой таблицы — `count(*)` в Supabase и Postgres совпадают.
- **Сверка контрольных записей:** список из ≈10 ID разных таблиц, поля совпадают точно.
- **Performance check:** время ответа на типичных запросах ≤200 мс p95.

### Stage C — Cutover Day (один день, 2-4 часа окна)

**Подготовка за день:** репетиция cutover'а на staging. Все скрипты проверены.

**Хронология окна:**
1. **T-30 мин:** объявление всем сотрудникам — "сегодня в Х:00 переключаемся, не пишите ничего в calc после Х:00."
2. **T+0:** kill-switch в старой calc — все таблицы read-only.
3. **T+5:** запуск финального delta-sync скрипта (Supabase → Postgres). Это берёт всё, что изменилось со времени последнего полного снапшота.
4. **T+15-30:** сверка row counts. Если не совпало — fix и retry.
5. **T+30-45:** золотые тесты на скопированных боевых данных. Если расхождение — стоп, откат, разбор.
6. **T+45:** DNS переключение `calc.recycleobject.ru` → новый сервер.
7. **T+50-90:** smoke в проде: логин, открыть склад, открыть один заказ, посчитать, списать тестовый кусок, отменить.
8. **T+90:** объявление "переключение завершено, можно работать в новой системе."

Старая Supabase + Vercel **остаются включёнными в read-only**, как safety net.

### Stage D — Safety Net + Cleanup (1-2 недели)

- 7 дней пользователи работают в новой системе.
- Если за неделю не было критических багов — отключаем Supabase Pro и Vercel.
- Чистка репо: удаляем `api/`, `yandex/supabase-proxy/`, `js/supabase.js`, fallback-каскад, finance/wiki/monitoring/неактуальное-tpa.
- Документация для будущей поддержки в `ops/README.md`.

### Что НЕ мигрируется (повтор)

Wiki, ТПА (кроме calc), Monitoring, Finance UI, FinTablo, bank-* таблицы, legacy_finance, fintablo_imports.

### Сроки в Claude Code-сессиях и календарном времени

Одна "сессия" — ~1-2 часа фокусной работы с Claude Code. Реальный календарь сильно зависит от твоего темпа.

| Stage | Сессии | Календарь (при 2-3 сессии/нед) | Календарь (при интенсивной работе ~1 сессия/день) |
|---|---|---|---|
| A: Build | ~45-70 сессий | 4-7 месяцев | 6-10 недель |
| B: Test | (включая 5-10 сессий доводки) | 1-2 нед | 1 нед |
| C: Cutover | 1 день | 1 день | 1 день |
| D: Safety + Cleanup | ~3-5 сессий | 1-2 нед | 1 нед |
| **Итого** | **~50-85 сессий + cutover-день** | **5-8 месяцев** | **2-3 месяца** |

Это **оптимистичный диапазон.** Реалистично закладывай +30%: всегда вылезает что-то, что глубже, чем казалось. Калькулятор в особенности.

## Operations

### Deploy

```
push в main →
  GitHub Actions:
    1. lint + unit tests + e2e (Playwright)
    2. build ops/web → dist/
    3. rsync ops/ → VPS:/srv/ops/
    4. ssh root@vps "cd /srv/ops && docker compose up -d --build"
    5. wait 10s, fetch /api/health, fail если не 200
```

Откат: каждый деплой создаёт тег `deploy-YYYYMMDD-HHMM`, скрипт `scripts/rollback.sh` делает `git checkout <tag>` и `docker compose up -d --build`.

### Backups

```
systemd timer на VPS, каждые 24 часа в 03:00 МСК:
  pg_dump postgres ops_db | gzip > /backup/YYYYMMDD-HHMM.sql.gz
  s3cmd put /backup/*.sql.gz s3://selectel-bucket/backups/
  rm файлы старше 7 дней локально
  retention в S3: 30 дней (lifecycle policy)
```

### Monitoring

- UptimeRobot (бесплатный): пинг `/api/health` каждую минуту, алёрт в email + Telegram.
- Логи Node API + бота → stdout → docker logs → ротация `--log-opt max-size=10m --log-opt max-file=5`.
- Postgres slow query log: `log_min_duration_statement = 500`.

### Restore drill

Раз в месяц вручную запускаем `scripts/restore-from-backup.sh` на staging — проверяем что бэкап действительно работает.

## Error Handling

- API возвращает структурированные ошибки.
- Фронт показывает локализованные сообщения по `error.code`.
- Сетевая ошибка → плашка "нет связи, нажми повторить". Кнопка повторяет с тем же `Idempotency-Key`.
- 401 → редирект на `/login`.
- 5xx → плашка "ошибка сервера", детали в логи Node API.
- Никакого silent fallback в локальный кэш для записей.

## Testing

- **Unit (API):** Node native test runner. Тесты на каждый эндпойнт.
- **Integration (API + БД):** временная Postgres-контейнер в CI.
- **E2E (Playwright):** smoke сценарии для критических флоу.
- **Golden-master snapshots** для калькулятора и заказов: 20+ реальных заказов, ожидаемые цифры зафиксированы. CI запускает на каждый PR.
- **Сверка данных перед cutover:** скрипт `scripts/compare-datasets.mjs` сравнивает Supabase и Postgres по row counts и контрольным записям. В CI запускается каждый день в Stage B.

## Cost Summary

### Во время разработки (Stage A + B)

| Компонент | Стоимость |
|---|---|
| Selectel Cloud Server (2 vCPU / 2 GB) | ≈500 ₽/мес |
| Selectel Object Storage (бэкапы + staging-фото) | ≈100-200 ₽/мес |
| Домен `ops-staging.recycleobject.ru` | ≈12 ₽/мес |
| Supabase Pro (для пользователей, не трогаем) | ≈$25/мес |
| Vercel (для пользователей, не трогаем) | $0–20/мес |
| **Итого во время разработки** | **~$32–38/мес** |

### После Stage D (демонтаж завершён)

| Компонент | Стоимость |
|---|---|
| Selectel Cloud Server | ≈500-800 ₽/мес (~$5–9) |
| Selectel Object Storage | ≈200-400 ₽/мес (~$2–4) |
| Домен | ≈12 ₽/мес |
| Supabase | **$0** |
| Vercel | **$0** |
| UptimeRobot Free | $0 |
| **Итого после миграции** | **~$7–13/мес** |

**Экономия:** $20–35/мес = $240–420/год после миграции. Окупаемость на год.

## Open Questions

- **Домен для staging.** Предлагаю `ops-staging.recycleobject.ru` во время Stage A/B. В день cutover'а — DNS существующего `calc.recycleobject.ru` указывается на новый сервер. Так пользователям не нужно менять URL.
- **`marketplace_orders` таблица существует отдельно от `marketplace_sets`?** Если да — мигрируем тоже.
- **Telegram-бот для алертов мониторинга** — настраиваем как часть Блока 1 или отдельно потом? Рекомендую: как часть Блока 1.
- **Восстановление пароля** на старте — через админа вручную, или email через какой-то SMTP? Рекомендую: вручную, SMTP — потом.
- **При миграции `employees`** — какие поля копировать, какие хранятся отдельно? Уточнить перед Блоком 2.
- **Production calendar** — сейчас хранится в `settings.productionCalendar`. Перенести в отдельную таблицу или оставить как `settings`-ключ?
- **Cutover-день** — какой выбираем? Желательно вечер пятницы или субботы, когда пользователи минимально активны.

## Risks and Mitigations

- **Калькулятор/заказы посчитают по-разному.** *Mitigation:* golden-master тесты с 20+ реальными заказами. CI блокирует merge при любом расхождении. В Stage B — ручная проверка с менеджерами на копии боевых данных перед cutover.
- **В Cutover-день что-то идёт не так.** *Mitigation:* (1) репетиция cutover'а на staging накануне; (2) скрипты сверки row counts и golden-master встроены в playbook; (3) Supabase остаётся в read-only режиме 1 неделю как safety net — можно вернуть DNS обратно за 5 минут.
- **VPS упал.** *Mitigation:* SLA Selectel ≥99.9%, ежесуточные бэкапы в Selectel S3, документированный playbook восстановления, отработанный раз в месяц.
- **Данные между Stage A snapshot и cutover delta — не сходятся.** *Mitigation:* Финальный delta-sync скрипт идемпотентен и грубо forceful (заменяет всё на свежее из Supabase). После него — сверка count'ов. Если расхождение — стоп и разбор.
- **Сотрудники не успевают подготовиться.** *Mitigation:* объявление за неделю; короткое видео/инструкция "как залогиниться и найти знакомые экраны"; кнопка возврата в старую calc на cutover-неделю.
- **Telegram bot ломается при переключении DB.** *Mitigation:* перевод бота — отдельный блок 12 в Stage A. Бот стартует на staging-БД параллельно со старым. В cutover-окне меняем подключение и проверяем.
- **Claude Code сделает что-то не то и я не замечу.** *Mitigation:* (1) golden-master тесты — основная защита от тихих регрессий в расчётах; (2) после каждого блока — ручная проверка на копии данных; (3) git history и возможность откатить любой блок; (4) Stage B = неделя интенсивного ручного тестирования перед cutover.
- **Бюджет/время поплыли.** *Mitigation:* Каждый блок Stage A независим — после любого можно остановиться, реальный продакшн от этого не страдает (пользователи в старой calc). Если "лень-устал-надоело" — старая calc продолжает работать, новая ждёт.

## Success Criteria

После Stage D:
- Сотрудница в России делает любую операцию (приёмка, списание, расчёт заказа) за <500 мс от клика до видимого подтверждения.
- За месяц после cutover не зарегистрировано ни одного случая "сохранила и пропало" / "после reload старые цифры" / "висит при сохранении".
- В коде проекта **нет** Supabase-клиента, нет `/api/bootstrap` Vercel, нет Yandex API Gateway proxy.
- Все golden-master тесты калькулятора и заказов зелёные.
- Стоимость инфры новой системы — не более $15/мес.
- Подписки Supabase и Vercel отключены.
- Ни одного активного заказа не "потерялось" в момент cutover'а — все исторические данные доступны в новой системе.
