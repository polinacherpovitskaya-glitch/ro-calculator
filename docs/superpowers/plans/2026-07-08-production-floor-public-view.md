# Производственная витрина цеха — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Публичная read-only страница-зеркало производственного календаря (`calc.recycleobject.ru/#gantt`) для цеха: сводка загрузки, недельный календарь, очередь и страница на каждый заказ (фото/цвет/кол-во/состав/этапы). Хостинг — тот же Яндекс-статик, что и calc2, под путём `/floor`.

**Architecture:** Node-скрипт-публикатор считает модель тем же кодом, что и `#gantt` (`buildProductionSchedule()` + пайплайн `Gantt.load()`, загружаемые в `vm`), курирует её в безопасный публичный JSON (без цен/маржи/ключей) и кладёт снимок в Yandex Object Storage под `floor/`. Отдельная статическая страница (`production-floor/`) фетчит этот JSON и рендерит витрину + страницы заказов. Данных из БД со страницы нет — только снимок.

**Tech Stack:** Node 24 (ESM-скрипты, как в `scripts/*.mjs`), ванильный HTML/CSS/JS (как `corporate-gift/`), Supabase REST (anon-key, как `scripts/export-supabase-snapshot.mjs`), Yandex Object Storage через `yc storage s3 cp` (как `.github/workflows/yandex-static-sync.yml`), тесты — Node smokes (как `tests/*-smoke.js`).

**Визуальный источник истины:** два макета, согласованные в сессии брейншторма (витрина + страница заказа). Presentational-разметка в задачах 3–4 описана по ним; воспроизводить по макетам и публичному стилю RePanel (`.public-*`, зелёный бренд `#214f2a`, крупный шрифт, адаптив).

---

## File Structure

| Файл | Ответственность | Создать / изменить |
| --- | --- | --- |
| `js/production-core.js` | Чистая (без DOM/сети) сборка модели плана: readiness, actuals, schedule, overload. Один источник истины для `#gantt` и публикатора. | Создать (вынести из `gantt.js`) |
| `js/gantt.js` | Использует `buildProductionModel()` из `production-core.js` вместо инлайн-пайплайна в `load()`. | Изменить (хирургически, `load()` ~76–130) |
| `scripts/production-floor-publish.mjs` | Читает Supabase → строит модель через `vm` → курирует в безопасный JSON (`plan.json`, `orders/<id>.json`) → пишет в `deploy/floor-public/`. Зеркалит фото. | Создать |
| `production-floor/index.html` | Разметка витрины (шапка, сводка, календарь, очередь, блокеры). | Создать |
| `production-floor/order.html` | Разметка страницы заказа (календарь наверху + карточки). | Создать |
| `production-floor/app.js` | Фетч `plan.json`/`orders/<id>.json`, рендер, «Обновить», хэш-роутер `#/order/<id>`. | Создать |
| `production-floor/style.css` | Публичный стиль (в духе RePanel), адаптив (ТВ + телефон). | Создать |
| `scripts/build-yandex-static.mjs` | Дополнительно: копировать `production-floor/` → `deploy/static-yandex/floor/` и звать публикатор, чтобы `floor/*.json` попал в бандл. | Изменить |
| `.github/workflows/yandex-static-sync.yml` | Дополнительно: прокинуть секреты для публикатора; JSON под `floor/` отдавать `no-cache`; поднять частоту (или отдельный cron ~15 мин). | Изменить |
| `tests/production-floor-core-smoke.js` | Парити: `buildProductionModel()` даёт те же числа, что и текущий `#gantt`-пайплайн. | Создать |
| `tests/production-floor-publish-smoke.js` | Курирование: в публичном JSON нет запрещённых полей (цены/маржа/ключи), есть обязательные поля заказа, числа = модели. | Создать |
| `docs/superpowers/specs/2026-07-08-production-floor-public-view-design.md` | Спека (уже есть). | — |

---

## Задачи

### Task 1: Вынести чистую сборку модели в `js/production-core.js`

Сейчас пайплайн живёт внутри `Gantt.load()` (`js/gantt.js:76–130`): деривация `production_ready_state`, `buildOrderActuals()` (`js/gantt.js:217`), `buildProductionSchedule()` (`js/calculator.js`), overload-сводка (`js/gantt.js:1248`). Выносим это в чистую функцию, которую зовут и `gantt.js`, и публикатор — так числа витрины гарантированно совпадают с `#gantt`.

**Files:**
- Create: `js/production-core.js`
- Modify: `js/gantt.js:76-130` (метод `load()`), `js/gantt.js:217` (`buildOrderActuals`) и readiness-деривация — перенести тела в core, оставить тонкие обёртки
- Test: `tests/production-floor-core-smoke.js`

- [ ] **Step 1: Написать парити-смоук (падающий)**

Смоук грузит `calculator.js` + `gantt.js` в `vm` (как `tests/production-calendar-smoke.js:67-81, 237-253`), прогоняет фиксированный набор заказов/настроек/часов двумя путями — текущим (методы `Gantt.*`) и новым `buildProductionModel(data)` — и сравнивает результат.

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const calculatorJs = fs.readFileSync(path.join(root, 'js', 'calculator.js'), 'utf8');
const coreJs = fs.readFileSync(path.join(root, 'js', 'production-core.js'), 'utf8');

const ctx = vm.createContext({ console, Math, Intl, JSON, Array, Object, String, Number, Boolean, RegExp, Set, Map, Date });
vm.runInContext(calculatorJs, ctx, { filename: 'js/calculator.js' });
vm.runInContext(coreJs, ctx, { filename: 'js/production-core.js' });

const fixture = require('./fixtures/production-floor-fixture.json'); // orders, orderItems, planState, settings, timeEntries, employees, china
const model = vm.runInContext('buildProductionModel(' + JSON.stringify(fixture) + ')', ctx);

assert.ok(Array.isArray(model.queue), 'model.queue is array');
assert.ok(Number.isFinite(model.dailyCapacity), 'model.dailyCapacity is number');
assert.ok(Array.isArray(model.blocked) && Array.isArray(model.review), 'blocked/review arrays');
assert.equal(model.queue[0].orderId, fixture.expected.firstQueueOrderId, 'queue order matches');
assert.equal(model.overload.firstOverloadDate, fixture.expected.firstOverloadDate, 'overload date matches');
```

Также создать `tests/fixtures/production-floor-fixture.json` с 3–4 заказами (ready / blocked-ждёт-Китай / needs_review), настройками `planning_workers_count`/`planning_hours_per_day`/`production_holidays`, парой `time_entries`, и блоком `expected` с ожидаемыми `firstQueueOrderId` и `firstOverloadDate` (значения взять из текущего `#gantt` на этих же данных).

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `node tests/production-floor-core-smoke.js`
Expected: FAIL (`production-core.js` ещё нет / `buildProductionModel is not defined`).

- [ ] **Step 3: Создать `js/production-core.js`**

Экспортировать в глобал (браузер + `vm`) чистую функцию `buildProductionModel(data)`. Перенести из `gantt.js` тела: readiness-классификатор (→ `deriveReadyState(order, items, china)`), `buildOrderActuals(entries, employees, orders)`, overload-сводку (`computeOverloadSummary(days, dailyCapacity)`), и оркестрацию из `load()` (сортировка очереди по plan-state → readiness split → `buildProductionSchedule(readyOrders, …)` → overload). Никаких `document`, `App`, `fetch`, `await` внутри — только вход-данные → модель.

```js
// js/production-core.js
(function (global) {
  function deriveReadyState(order, items, chinaPurchases) { /* перенос из gantt.js:~380-411 */ }
  function buildOrderActuals(entries, employees, orders) { /* перенос из gantt.js:217 */ }
  function computeOverloadSummary(days, dailyCapacity) { /* перенос из gantt.js:~1248 */ }

  function buildProductionModel(data) {
    const { orders, orderItems, planState, settings, timeEntries, employees, chinaPurchases } = data;
    const actuals = buildOrderActuals(timeEntries, employees, orders);
    const enriched = orders.map(o => ({ ...o, production_ready_state: deriveReadyState(o, orderItems, chinaPurchases) }));
    const blocked = enriched.filter(o => o.production_ready_state === 'blocked');
    const review = enriched.filter(o => o.production_ready_state === 'needs_review');
    const ready = enriched.filter(o => o.production_ready_state === 'ready');
    const schedule = buildProductionSchedule(ready, planState, settings, actuals); // сигнатуру взять из calculator.js
    const overload = computeOverloadSummary(schedule.days, schedule.dailyCapacity);
    return { queue: schedule.queue, days: schedule.days, dailyCapacity: schedule.dailyCapacity, blocked, review, overload, actuals };
  }

  global.deriveReadyState = deriveReadyState;
  global.buildOrderActuals = buildOrderActuals;
  global.computeOverloadSummary = computeOverloadSummary;
  global.buildProductionModel = buildProductionModel;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

Точные границы переноса и сигнатуру `buildProductionSchedule(...)` подтвердить по `js/gantt.js` и `js/calculator.js` при реализации. Держать хирургично: тела переносим 1:1, поведение не меняем.

- [ ] **Step 4: Переключить `gantt.js` на core**

В `index.html` подключить `<script src="js/production-core.js?v=N"></script>` **до** `gantt.js`. В `Gantt.load()` заменить инлайн-пайплайн (`js/gantt.js:76-130`) на: собрать `data` из уже загруженных `orders/orderItems/planState/settings/timeEntries/employees/china` → `const model = buildProductionModel(data)` → разложить `this.schedule/blockedOrders/reviewOrders/...` из `model`. `Gantt.buildOrderActuals` оставить тонкой обёрткой над core (обратная совместимость смоука `production-calendar-smoke.js`, который матчит `buildOrderActuals(`). Бампнуть версию по правилам `AGENTS.md` (4 анкера + `?v=` у затронутых `<script>`).

- [ ] **Step 5: Запустить оба смоука — зелёные**

Run: `node tests/production-floor-core-smoke.js && node tests/production-calendar-smoke.js`
Expected: PASS оба (парити + отсутствие регресса в `#gantt`).

- [ ] **Step 6: Commit**

```bash
git add js/production-core.js js/gantt.js index.html js/version.json js/app.js tests/production-floor-core-smoke.js tests/fixtures/production-floor-fixture.json
git commit -m "refactor: extract pure production model into production-core.js"
```

---

### Task 2: Публикатор снимка `scripts/production-floor-publish.mjs`

> **Реальная схема (проверено на живом Supabase 2026-07-09):** anon-REST-чтение работает для всех нужных таблиц (orders, order_items, app_colors, molds, hw_blanks, pkg_blanks, work_assets, settings, time_entries, employees, china_purchases). Курирование ОБЯЗАТЕЛЬНО по белому списку (собирать публичные объекты поле-за-полем, НИКОГДА не спредить сырые строки): у `orders` есть `total_cost/total_revenue/total_margin/margin_percent`, ИНН/банк/телефон/`delivery_address`, `calculator_data`, `items_snapshot`/`hardware_snapshot`/`packaging_snapshot`; у `order_items` — `sell_price_item/cost_total/unit_price` и JSON-блоб `item_data` (внутри — `cost_*/sell_*/target_*/price_cny`). Богатые поля позиции живут в `item_data`: поле `item_type` = `product` | `hardware` | `packaging`; product несёт `quantity`, `weight_grams`, `is_nfc`/`nfc_programming`, `color_id`/`color_name`/`colors`, `color_solution_attachment`, `hours_plastic/hours_cutting/hours_nfc/hours_assembly`; hardware/packaging несут `quantity`, `weight_grams`, `hours_hardware`/`hours_packaging`, `*_warehouse_sku`. Цвет-hex лежит в `app_colors.color_data` (JSON). **Фото негусто:** `product_templates` пуст → фото искать по `template_id` в `molds.mold_data`/`hw_blanks.blank_data`/`pkg_blanks.blank_data`, либо `item_data.color_solution_attachment`; если нет — `null` («фото если есть»). **Полей «габариты»/«маркировка/артикул»/«дата отгрузки» в БД НЕТ** — показываем `weight_grams` (вес), NFC-флаги, и `orders.notes` (freeform, обычно инструкции для цеха) как «примечание»; отсутствующее опускаем. Извлечение цвета/позиций переиспользовать по `js/order-detail.js` (`_normalizeProductColors`, `_normalizeColorAttachments`, группировка по цвету ~763).

**Files:**
- Create: `scripts/production-floor-publish.mjs`
- Test: `tests/production-floor-publish-smoke.js`

- [ ] **Step 1: Написать смоук курирования (падающий)**

Смоук гоняет публикатор в «оффлайн»-режиме: подсовывает фиксстур-данные (env `RO_FLOOR_FIXTURE=tests/fixtures/production-floor-fixture.json`, чтобы не ходить в сеть), пишет в temp-каталог, затем проверяет результат.

```js
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'floor-'));
execFileSync('node', ['scripts/production-floor-publish.mjs'], {
  env: { ...process.env, RO_FLOOR_FIXTURE: 'tests/fixtures/production-floor-fixture.json', RO_FLOOR_OUT_DIR: out },
  stdio: 'inherit',
});

const plan = JSON.parse(fs.readFileSync(path.join(out, 'plan.json'), 'utf8'));
const orderFiles = fs.readdirSync(path.join(out, 'orders'));
const anyOrder = JSON.parse(fs.readFileSync(path.join(out, 'orders', orderFiles[0]), 'utf8'));

// 1) Граница безопасности: запрещённые поля нигде не встречаются
const FORBIDDEN = /"?(price|cost|margin|sell_price|target_price|cost_total|profit|purchase_price|себестоим|маржа|выручк)/i;
assert.doesNotMatch(JSON.stringify(plan), FORBIDDEN, 'plan.json must not leak money fields');
assert.doesNotMatch(JSON.stringify(anyOrder), FORBIDDEN, 'order json must not leak money fields');
assert.doesNotMatch(JSON.stringify(plan) + JSON.stringify(anyOrder), /eyJhbGciOiJ|supabase\.co|apigw\.yandexcloud/i, 'no keys/urls leaked');

// 2) Обязательные поля витрины
assert.ok(plan.generated_at && Number.isFinite(plan.daily_capacity_hours), 'plan header present');
assert.ok(Array.isArray(plan.queue) && Array.isArray(plan.blocked) && plan.calendar, 'plan sections present');
assert.ok('in_shop_count' in plan && plan.summary, 'summary + in_shop present');

// 3) Обязательные поля заказа (то, что просило производство)
for (const k of ['name','client','quantity','colors','stages','calendar_segments','deadline','deadline_state']) {
  assert.ok(k in anyOrder, 'order json missing ' + k);
}
assert.ok(['photo_url','ship_date','marking','dimensions','nfc','note'].every(k => k in anyOrder), 'order json must expose all requested optional fields (null ok)');

// 4) Парити чисел с моделью
// (сравнить plan.queue[0].hours.remaining с buildProductionModel на том же фикстуре — как в core-smoke)
```

- [ ] **Step 2: Запустить — падает**

Run: `node tests/production-floor-publish-smoke.js`
Expected: FAIL (скрипта нет).

- [ ] **Step 3: Реализовать публикатор**

Структура по образцу `scripts/export-supabase-snapshot.mjs` (Supabase REST, anon-key, пагинация) + `vm`-загрузка `calculator.js`+`production-core.js` (как в core-smoke). Псевдо-скелет:

```js
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const OUT_DIR = path.resolve(root, process.env.RO_FLOOR_OUT_DIR || 'deploy/floor-public');
const FIXTURE = process.env.RO_FLOOR_FIXTURE; // тестовый режим без сети

async function loadData() {
  if (FIXTURE) return JSON.parse(fs.readFileSync(path.resolve(root, FIXTURE), 'utf8'));
  // иначе — REST-чтение как в export-supabase-snapshot.mjs:
  // orders, order_items, settings, china_purchases, time_entries, employees, product_templates, app_colors
  return { orders, orderItems, planState, settings, timeEntries, employees, chinaPurchases, productTemplates, appColors };
}

function buildModel(data) {
  const ctx = vm.createContext({ console, Math, Intl, JSON, Array, Object, String, Number, Boolean, RegExp, Set, Map, Date });
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'calculator.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'production-core.js'), 'utf8'), ctx);
  return vm.runInContext('buildProductionModel(' + JSON.stringify(data) + ')', ctx);
}

// Курирование: из модели + сырых данных собрать ТОЛЬКО безопасные поля
function toPublicPlan(model, data) { /* см. JSON-контракт ниже */ }
function toPublicOrder(orderId, model, data) { /* см. JSON-контракт ниже */ }

const data = await loadData();
const model = buildModel(data);
fs.mkdirSync(path.join(OUT_DIR, 'orders'), { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'plan.json'), JSON.stringify(toPublicPlan(model, data)));
for (const o of [...model.queue, ...model.blocked, ...model.review]) {
  fs.writeFileSync(path.join(OUT_DIR, 'orders', o.orderId + '.json'), JSON.stringify(toPublicOrder(o.orderId, model, data)));
}
// фото: см. Step 4
```

**Контракт `plan.json`:**
```json
{ "generated_at": "ISO", "in_shop_count": 2, "daily_capacity_hours": 16, "worker_slots": 2, "hours_per_person": 8,
  "summary": { "queue_count": 7, "queue_hours_remaining": 214, "late_count": 0, "tight_count": 1,
               "first_overload_date": "2026-07-14", "first_overload_hours": 6, "blocked_count": 2, "review_count": 1 },
  "calendar": { "mode": "week", "range_start": "2026-07-07", "range_end": "2026-07-13",
    "days": [{ "date": "2026-07-07", "weekday": "Пн", "nonworking": false }],
    "rows": [{ "order_id": 1043, "name": "Ваза «Волна»", "client": "ООО Дом",
      "segments": [{ "stage": "molding", "start": "2026-07-07", "days": 2 }] }] },
  "queue": [{ "order_id": 1043, "name": "Ваза «Волна»", "client": "ООО Дом", "start_date": "2026-07-07",
    "deadline": "2026-07-16", "deadline_state": "buffer", "deadline_buffer_days": 3,
    "hours": { "plan": 24, "fact": 9, "remaining": 15 }, "thumb_url": null,
    "colors": [{ "name": "Терракот", "hex": "#C56B3F" }], "quantity": 120 }],
  "blocked": [{ "order_id": 1050, "name": "Ваза «Гранит»", "client": "ООО Стиль",
    "state": "blocked", "reason": "Ждёт молд из Китая" }] }
```

**Контракт `orders/<id>.json`:**
```json
{ "order_id": 1043, "name": "Ваза «Волна»", "client": "ООО Дом", "status": "in_production", "status_label": "В производстве",
  "deadline": "2026-07-16", "deadline_state": "buffer", "deadline_buffer_days": 3,
  "ship_date": null, "marking": null, "dimensions": null, "weight_grams": 480, "nfc": null,
  "note": "Матовый лак...", "photo_url": null, "quantity": 120,
  "colors": [{ "name": "Терракот", "hex": "#C56B3F" }, { "name": "Молоко", "hex": "#F2EBDD" }],
  "items": [{ "kind": "product", "name": "Ваза Волна", "colors": [], "quantity": 120, "thumb_url": null },
            { "kind": "hardware", "name": "Шнур джут", "quantity": 120 },
            { "kind": "packaging", "name": "Крафт-коробка", "quantity": 120 }],
  "stages": [{ "stage": "molding", "label": "Литьё", "plan": 8, "fact": 9, "remaining": 0 },
             { "stage": "assembly", "label": "Сборка", "plan": 10, "fact": 0, "remaining": 10 },
             { "stage": "packaging", "label": "Упаковка", "plan": 6, "fact": 0, "remaining": 6 }],
  "calendar_segments": [{ "stage": "molding", "start": "2026-07-07", "days": 2 }],
  "calendar_days": [{ "date": "2026-07-07", "weekday": "Пн", "nonworking": false }] }
```

Извлечение полей (подтвердить по live-данным, при отсутствии — `null`, «фото если есть»):
- количество — `order_items.quantity` (+ `hardware_qty`/`packaging_qty`/`printing_qty` для под-позиций);
- цвет — переиспользовать группировку по цвету из `js/order-detail.js` (см. `order-detail.js:763` «Group elements by color») + `app_colors` (имя/hex);
- фото — `order_items.template_id` → `product_templates.photo_url`;
- габариты/вес — `order_items.weight_grams` и размерные поля, если есть; дата отгрузки/маркировка/NFC — из полей заказа/позиций (`is_nfc`, `nfc_programming`);
- `deadline_state` — рабочие-дни-буфер, та же логика, что в `#gantt` (late/tight/buffer).

- [ ] **Step 4: Фото — публичные URL или зеркало**

Если `product_templates.photo_url` уже публично доступен (http-URL) — писать его в `photo_url`/`thumb_url` как есть. Если приватный/`data:`/через прокси — скачать и положить в `deploy/floor-public/photos/<order_id>.jpg`, а в JSON писать `floor/photos/<order_id>.jpg`. Нет фото — `null`.

- [ ] **Step 5: Ошибкоустойчивость**

Обернуть загрузку/расчёт в try/catch: при любой ошибке — не перезаписывать `plan.json` (оставить прошлый снимок), выйти с ненулевым кодом и (в CI) дёрнуть существующий telegram-alert. Всегда штамповать `generated_at`.

- [ ] **Step 6: Запустить смоук — зелёный**

Run: `node tests/production-floor-publish-smoke.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/production-floor-publish.mjs tests/production-floor-publish-smoke.js
git commit -m "feat: production floor snapshot publisher"
```

---

### Task 3: Статическая витрина `production-floor/index.html` + `app.js` + `style.css`

Разметку и стиль воспроизвести по согласованному макету витрины и публичному стилю RePanel (`.public-*`, `--public-brand:#214f2a`, крупный шрифт, адаптив ТВ+телефон). Данные — только из `plan.json`.

**Files:**
- Create: `production-floor/index.html`, `production-floor/app.js`, `production-floor/style.css`

- [ ] **Step 1: Каркас страницы**

`index.html` (шаблон — `corporate-gift/index.html`): `<head>` с `style.css`, `<body>` с контейнерами: шапка (заголовок + «Обновлено …» + «Обновить»), сетка сводки (4 карточки: `Сейчас в цехе`, `Мощность`, `В очереди`, `Первый перегруз`), блок календаря (неделя), `Очередь к запуску`, `Ждут молд / Китай`. Пустые контейнеры с id: `#floor-updated`, `#floor-summary`, `#floor-calendar`, `#floor-queue`, `#floor-blocked`, кнопка `#floor-refresh`.

- [ ] **Step 2: Фетч + рендер (`app.js`)**

```js
const BASE = new URL('.', location.href).href; // .../floor/
async function loadPlan() {
  const res = await fetch(BASE + 'plan.json?ts=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('plan fetch ' + res.status);
  return res.json();
}
function render(plan) {
  renderUpdated(plan.generated_at);           // «Обновлено 8 июл, 18:32» + плашка «данные могли устареть», если >30 мин
  renderSummary(plan);                        // 4 карточки
  renderCalendar(plan.calendar);              // недельная мини-гантта: дни + сегменты по этапам, «сегодня»
  renderQueue(plan.queue);                    // карточки: имя/клиент, дедлайн-бейдж, часы факт/план/осталось, превью+цвет+кол-во, ссылка #/order/<id>
  renderBlocked(plan.blocked);                // ждут молд/Китай + требуют проверки
}
document.getElementById('floor-refresh').addEventListener('click', () => loadPlan().then(render).catch(showError));
loadPlan().then(render).catch(showError);
```

Цвета этапов = как в `#gantt`: Литьё `#f59e0b`, Сборка `#06b6d4`, Упаковка `#8b5cf6`. Дедлайн-бейджи: buffer=зелёный, tight=оранжевый, late=красный. Все числа — через `Math.round`.

- [ ] **Step 3: Адаптив**

Desktop/ТВ: сводка в 4 колонки, календарь широкий, крупный шрифт. `@media (max-width: 720px)`: всё в один столбец, календарь горизонтально скроллится внутри своего контейнера (страница по горизонтали не скроллится), карточки крупные.

- [ ] **Step 4: Проверка (локально)**

Run: `python3 -m http.server 4173` в каталоге с `production-floor/` и тестовым `plan.json` рядом; открыть `/production-floor/`, проверить обе ширины (desktop + мобайл).
Expected: секции рендерятся, «Обновить» перечитывает JSON, горизонтального скролла страницы нет.

- [ ] **Step 5: Commit**

```bash
git add production-floor/index.html production-floor/app.js production-floor/style.css
git commit -m "feat: production floor public view page"
```

---

### Task 4: Страница заказа (`#/order/<id>`)

Календарь заказа — наверху; ниже — фото, цвет, количество, состав, этапы/часы, габариты/дата отгрузки/маркировка/NFC/примечание. По согласованному макету страницы заказа.

**Files:**
- Create: `production-floor/order.html`
- Modify: `production-floor/app.js` (хэш-роутер + рендер заказа)

- [ ] **Step 1: Роутер**

В `app.js` добавить хэш-роутинг: если `location.hash` матчит `#/order/<id>` → грузить `orders/<id>.json` и рендерить страницу заказа; иначе — витрина. Ссылки в очереди — `#/order/<id>` (SPA без сервера). Кнопка «К календарю» → `#/`.

```js
function currentOrderId() { const m = location.hash.match(/^#\/order\/(\d+)/); return m ? m[1] : null; }
async function route() {
  const id = currentOrderId();
  if (!id) return loadPlan().then(render).catch(showError);
  const res = await fetch(BASE + 'orders/' + id + '.json?ts=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) return showError();
  renderOrder(await res.json());
}
window.addEventListener('hashchange', route);
route();
```

- [ ] **Step 2: Рендер заказа**

`renderOrder(o)`: шапка (имя/клиент/№, статус-бейдж, дедлайн-бейдж) → блок «Календарь заказа» (дни + сегменты `o.calendar_segments` по `o.calendar_days`, «сегодня») → «Что делаем» (фото `o.photo_url` или плейсхолдер «фото если есть»; количество; цвет-свотчи `o.colors`; молд/бланк; вес/габариты) → «Состав» (`o.items`: изделия/фурнитура/упаковка с кол-вом и превью) → «Этапы и часы» (`o.stages`: план/факт/осталось) → «Примечание для цеха» (`o.note`, если есть). Отсутствующие поля не рисуем (без «дыр»).

- [ ] **Step 3: Проверка (локально)**

Run: тем же `http.server`, открыть `/production-floor/#/order/<id>` с тестовым `orders/<id>.json`.
Expected: календарь наверху, фото/цвет/кол-во/состав/этапы/примечание на местах; пустые опциональные поля скрыты.

- [ ] **Step 4: Commit**

```bash
git add production-floor/order.html production-floor/app.js
git commit -m "feat: production floor per-order page"
```

---

### Task 5: Выкладка — сборка бандла + Yandex sync + cron

**Files:**
- Modify: `scripts/build-yandex-static.mjs`, `.github/workflows/yandex-static-sync.yml`

- [ ] **Step 1: Включить витрину и снимок в бандл**

В `scripts/build-yandex-static.mjs`: после сборки `deploy/static-yandex/` — (1) скопировать `production-floor/` → `deploy/static-yandex/floor/` (добавить в `COPY_PATHS`/отдельный copy c ремапом путей, как `rewriteIndexForObjectStorage`, но `floor/`-относительные пути можно оставить относительными), (2) вызвать публикатор с `RO_FLOOR_OUT_DIR=deploy/static-yandex/floor` (импортом функции или `execFileSync('node', ['scripts/production-floor-publish.mjs'])`), чтобы `floor/plan.json` и `floor/orders/*.json` попали в загрузку.

- [ ] **Step 2: Кэш-контроль для JSON/HTML под floor**

В `yandex-static-sync.yml`, `upload_one()`: убедиться, что `floor/*.html` и `floor/**/*.json` уходят с `Cache-Control: no-cache, no-store, must-revalidate` (расширить существующее условие, которое уже так делает для `data/bootstrap.json`). Фото `floor/photos/*` — обычный `immutable`.

- [ ] **Step 3: Секреты публикатора в workflow**

В шаге «Build Yandex static bundle» прокинуть env, которые нужны публикатору (те же `SUPABASE_URL`/`SUPABASE_ANON_KEY`, уже есть). Частота: `yandex-static-sync.yml` уже крон `*/30`. Для ~15 мин — либо сменить cron на `*/15 * * * *`, либо отдельный лёгкий workflow, который зовёт только публикатор + `yc s3 cp floor/**`. Рекомендация: оставить общий sync `*/30` для MVP, поднять до `*/15`, если цех попросит свежее.

- [ ] **Step 4: Проверка сборки локально**

Run: `SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/build-yandex-static.mjs && ls deploy/static-yandex/floor && ls deploy/static-yandex/floor/orders | head`
Expected: `index.html`, `order.html`, `app.js`, `style.css`, `plan.json`, `orders/*.json` присутствуют.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-yandex-static.mjs .github/workflows/yandex-static-sync.yml
git commit -m "chore: deploy production floor view to yandex /floor"
```

---

### Task 6: Документация и финальная регрессия

**Files:**
- Modify: `docs/production-calendar-status.md` (добавить строку про публичную витрину), `AGENTS.md` (упомянуть `production-floor/` как отдельную публичную страницу, не трогающую version-анкеры calc)

- [ ] **Step 1: Обновить статус/доки**

Кратко: появилась публичная витрина `calc2.recycleobject.ru/floor` (зеркало `#gantt`, снимок каждые ~30 мин), код — `production-floor/` + `scripts/production-floor-publish.mjs` + `js/production-core.js`.

- [ ] **Step 2: Прогнать регрессию**

Run:
```bash
for f in js/*.js; do node --check "$f"; done
node tests/production-floor-core-smoke.js
node tests/production-floor-publish-smoke.js
node tests/production-calendar-smoke.js
node tests/version-smoke.js
```
Expected: всё PASS (в т.ч. `#gantt` не сломан, version-анкеры согласованы).

- [ ] **Step 3: Commit**

```bash
git add docs/production-calendar-status.md AGENTS.md
git commit -m "docs: production floor public view"
```

---

## Self-Review — покрытие спеки

- Публичная read-only витрина, без входа, адаптив → Tasks 3, 5.
- Сводка «в цехе / мощность / очередь / перегруз» → Task 2 (`plan.summary`), Task 3.
- Календарь неделя по этапам → Task 2 (`plan.calendar`), Task 3.
- Очередь с часами факт/план/осталось + превью/цвет/кол-во → Task 2, Task 3.
- Блокеры «ждут молд/Китай» + «требуют проверки» → Task 1 (readiness), Task 2, Task 3.
- Страница заказа: календарь наверху + фото/цвет/кол-во/состав/этапы/габариты/отгрузка/маркировка/NFC/примечание → Task 2 (`orders/<id>.json`), Task 4.
- Числа = `#gantt` (тот же движок) → Task 1 (`buildProductionModel` + парити-смоук).
- Актуальность ~15–30 мин + «Обновить» → Task 5 (cron), Task 3/4 (`?ts=` refetch).
- Граница безопасности (нет цен/маржи/ключей) → Task 2 (курирование) + `production-floor-publish-smoke` (запрещённые поля).
- Хостинг = путь на текущем Яндексе (`/floor`) → Task 5.
- Не-цели (без редактирования/входа/live-БД/вложений; не трогаем version-анкеры calc) → соблюдено; `production-floor/` отдельная статика.

**Открытые места, подтвердить при реализации:** точные границы переноса в `production-core.js` и сигнатура `buildProductionSchedule(...)`; фактические поля цвета/фото/габаритов на live-данных (graceful `null`); нужен ли `*/15` cron сразу.
