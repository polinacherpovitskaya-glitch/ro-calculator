# План: бонусы, ядро и схема начальника производства

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Связанный дизайн: `docs/specs/2026-09-09-bonuses-production-manager.md`.
Ветка: `codex/bonuses-production-manager` (спека уже в ней). Один PR.

**Goal:** Страница «Бонусы» в calc, видимая только владельцу, где по кварталам считается бонус начальника производства из живых данных (нормо-часы завершённых заказов, табель, дедлайны, переделки) с журналом закрытых периодов.

**Architecture:** Расчёт и хранение в `ops/api` (Express, ESM): чистые функции в `ops/api/src/bonuses/calc.js`, доступ к своим таблицам в `store.js`, чтение legacy-строк из `compat_rows` в `legacy.js`, маршруты `/api/bonuses/*` под ролью admin. Страница в calc: `js/bonuses.js` дергает API через `fetch` с cookie-сессией и рисует карточки. API в пути записи заказа начинает проставлять `completed_at`.

**Tech Stack:** Node 20, Express, Postgres 16 (`node --test` с живой БД), vanilla JS calc без бандлера, `node:test` для чистых функций calc, smoke-тесты в `tests/`.

## Global Constraints

- Все маршруты `/api/bonuses/*`: `router.use(requireAuth, requireRole('admin'))`. Пользователь с ролью `user` получает 403.
- Страница `bonuses` НЕ добавляется в `App.ALL_PAGES` и `App.DEFAULT_PAGES`; доступ только через `App.isOwner()` = `currentUser.role === 'admin' && currentUser.employee_id == null`.
- Legacy-данные читаются только из `compat_rows` (таблицы `orders`, `time_entries`, `employees`, `settings`). Нормализованные таблицы ops (`orders`, `time_entries` без префикса) для расчёта не используются.
- Шкала достижения: ниже `min` = 0; `min` = 0,5; `target` = 1,0; `max` = 1,5; между порогами линейно; выше `max` = 1,5. Коэффициенты из `ladder_json`.
- Веса по умолчанию: `output_hours` 0.50, `productivity` 0.25, `on_time_share` 0.15, `rework_share` 0.10.
- Коммерческий заказ = `production_purpose` не `rework` и не `stock_sample` (как в `js/production_load.js`), статус не `cancelled`/`deleted`, нет `deleted_at`.
- Пустой табель по завершённым заказам: `productivity` не считается, доля = 0, предупреждение `no_timesheet`. Ничего не приписываем догадкой.
- Версия calc: четыре якоря (`js/version.json`, `js/app.js`, два места в `index.html`) + `?v=` у изменённых скриптов. Перед бампом читать `origin/main`.
- Даты legacy-строк: `deadline`, `date` табеля — строки `YYYY-MM-DD`; `completed_at`, `updated_at` — ISO. Сравниваем по первым 10 символам.
- Суммы в рублях округляются до рубля (`Math.round`).
- Коммит после каждой задачи, сообщения в повелительном наклонении, без `--no-verify`.

## Структура файлов

Создать:

- `ops/db/migrations/019_bonuses.sql` — четыре таблицы бонусов.
- `ops/api/src/compat-rows.js` — `readCompatRows(client, table, lock)`; общий читатель `compat_rows`.
- `ops/api/src/bonuses/calc.js` — чистые функции: периоды, рабочие дни, шкала, расчёт квартала, год, подсказка целей.
- `ops/api/src/bonuses/legacy.js` — загрузка и нормализация legacy-строк для расчёта.
- `ops/api/src/bonuses/store.js` — SQL к таблицам `bonus_*`.
- `ops/api/src/routes/bonuses.js` — маршруты.
- `ops/api/test/bonuses-calc.test.js` — чистые функции.
- `ops/api/test/bonuses-routes.test.js` — маршруты с живой БД.
- `js/bonuses.js` — страница (модуль `Bonuses` + чистые render-функции с `module.exports`).
- `test/bonuses_render.test.js` — чистые render-функции.
- `tests/bonuses-smoke.js` — проводка страницы в `index.html`/`app.js`.

Изменить:

- `ops/api/src/routes/compat.js` — импорт `readCompatRows`, проставление `completed_at`, экспорт `stampCompletedAt`.
- `ops/api/src/server.js` — монтирование `/api/bonuses`.
- `index.html` — пункт меню, контейнер страницы, тег скрипта, якоря версии.
- `js/app.js` — `isOwner()`, ветка в `canAccess`, `case 'bonuses'` в `onPageEnter`, якорь версии.
- `js/version.json` — якорь версии.

---

### Task 0: Проверка доступа владельца

**Files:** нет изменений кода.

- [ ] **Step 1: Проверить роли в API**

На VM (`ssh ops@ops-staging.recycleobject.ru` или прод-хост из `ops/README.md`):

```bash
cd /srv/ops/infra && docker compose exec postgres psql -U ops -d ops -c "SELECT id, email, role, employee_id FROM auth_users WHERE role = 'admin';"
```

Ожидание: одна строка, e-mail владельца, `employee_id` пустой. Если строк больше, у лишних `UPDATE auth_users SET role = 'user' WHERE id = <id>;` после подтверждения владельца.

- [ ] **Step 2: Проверить владельца в calc**

Войти в calc под владельцем, в консоли браузера:

```js
[App.currentUser.role, App.currentUser.employee_id]
```

Ожидание: `['admin', null]` (или `undefined`). Если `employee_id` заполнен, в Настройки → Учётные записи отвязать сотрудника от учётной записи владельца. Без этого `isOwner()` вернёт `false`, и дальше двигаться нельзя.

---

### Task 1: Миграция и общий читатель compat_rows

**Files:**
- Create: `ops/db/migrations/019_bonuses.sql`
- Create: `ops/api/src/compat-rows.js`
- Modify: `ops/api/src/routes/compat.js:165-174` (локальный `readRows`)
- Test: `ops/api/test/bonuses-routes.test.js` (первый тест)

**Interfaces:**
- Produces: `readCompatRows(client, table, lock = false): Promise<object[]>` — массив `data` строк таблицы `table` из `compat_rows`, отсортированный по `source_id`.
- Produces: таблицы `bonus_schemes`, `bonus_period_targets`, `bonus_stock_approvals`, `bonus_period_results`.

- [ ] **Step 1: Написать миграцию**

```sql
-- 019_bonuses.sql
-- Схемы бонусов, цели периодов, утверждения складских работ, результаты.
-- Доступ только из API.

CREATE TABLE IF NOT EXISTS bonus_schemes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id     BIGINT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('production', 'commercial')),
  period_type     TEXT NOT NULL DEFAULT 'quarter' CHECK (period_type = 'quarter'),
  target_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  metrics_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  ladder_json     JSONB NOT NULL DEFAULT '{"below_min":0,"min":0.5,"target":1,"max":1.5}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bonus_schemes_active_employee
  ON bonus_schemes (employee_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS bonus_period_targets (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_id       BIGINT NOT NULL REFERENCES bonus_schemes(id) ON DELETE CASCADE,
  period          TEXT NOT NULL,
  metric_key      TEXT NOT NULL,
  min_value       NUMERIC NOT NULL,
  target_value    NUMERIC NOT NULL,
  max_value       NUMERIC NOT NULL,
  note            TEXT NOT NULL DEFAULT '',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scheme_id, period, metric_key)
);

CREATE TABLE IF NOT EXISTS bonus_stock_approvals (
  period          TEXT NOT NULL,
  order_id        BIGINT NOT NULL,
  approved_by     TEXT NOT NULL DEFAULT '',
  approved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (period, order_id)
);

CREATE TABLE IF NOT EXISTS bonus_period_results (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_id       BIGINT NOT NULL REFERENCES bonus_schemes(id) ON DELETE CASCADE,
  period          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'paid')),
  computed_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  amount_computed NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_final    NUMERIC(14,2) NOT NULL DEFAULT 0,
  adjustments_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  closed_at       TIMESTAMPTZ,
  closed_by       TEXT NOT NULL DEFAULT '',
  paid_at         TIMESTAMPTZ,
  UNIQUE (scheme_id, period)
);

INSERT INTO app_meta (id, version) VALUES (1, '019-bonuses')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();
```

- [ ] **Step 2: Применить миграцию локально**

```bash
DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" ops/db/migrate.sh
```

Ожидание: строка `Running 019_bonuses.sql`, без ошибок.

- [ ] **Step 3: Вынести читатель compat_rows**

`ops/api/src/compat-rows.js`:

```js
// Общий читатель строк legacy-таблиц calc. Единственная точка, откуда
// серверные модули читают compat_rows целиком.
export async function readCompatRows(client, table, lock = false) {
  const { rows } = await client.query(
    `SELECT data
       FROM compat_rows
      WHERE table_name = $1
      ORDER BY source_id${lock ? ' FOR UPDATE' : ''}`,
    [table],
  );
  return rows.map((row) => row.data);
}
```

В `ops/api/src/routes/compat.js` удалить локальную `async function readRows(...)` (строки 165–174) и добавить рядом с импортами:

```js
import { readCompatRows as readRows } from '../compat-rows.js';
```

- [ ] **Step 4: Первый тест маршрутов (каркас + читатель)**

`ops/api/test/bonuses-routes.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from '../src/server.js';
import { getPool } from '../src/db.js';
import { hashPassword } from '../src/auth/argon.js';
import { readCompatRows } from '../src/compat-rows.js';

const DB_URL = process.env.TEST_DATABASE_URL || 'postgres://ops:ops_dev_password@127.0.0.1:5433/ops';
process.env.DATABASE_URL = DB_URL;

export async function startServer(t) {
  const app = createServer();
  const server = app.listen(0);
  t.after(() => server.close());
  return server.address().port;
}

export async function createUser(role = 'admin') {
  const email = `bonuses-${crypto.randomUUID()}@x.test`;
  const passwordHash = await hashPassword('testpass1234');
  const { rows } = await getPool().query(
    `INSERT INTO auth_users (email, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, FALSE) RETURNING id, email`,
    [email, passwordHash, role],
  );
  return rows[0];
}

export async function login(port, email) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'testpass1234' }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

export async function setup(t, role = 'admin') {
  const user = await createUser(role);
  const port = await startServer(t);
  const cookie = await login(port, user.email);
  return { port, cookie, user };
}

export async function requestJson(port, method, path, body, cookie) {
  const headers = { cookie, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() };
  const options = { method, headers };
  if (body !== undefined) options.body = JSON.stringify(body);
  return fetch(`http://127.0.0.1:${port}${path}`, options);
}

// Кладёт legacy-строку в compat_rows. source_id = String(row.id) или row.key для settings.
export async function putCompatRow(table, row) {
  const sourceId = table === 'settings' ? String(row.key) : String(row.id);
  await getPool().query(
    `INSERT INTO compat_rows (table_name, source_id, data)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (table_name, source_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [table, sourceId, JSON.stringify(row)],
  );
}

test('readCompatRows возвращает data строк таблицы', async () => {
  const id = Date.now();
  await putCompatRow('orders', { id, order_name: 'compat-reader', status: 'draft' });
  const rows = await readCompatRows(getPool(), 'orders');
  assert.ok(rows.some((row) => row.id === id && row.order_name === 'compat-reader'));
});
```

- [ ] **Step 5: Запустить тест**

```bash
cd ops/api && TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" node --test test/bonuses-routes.test.js test/compat-routes.test.js
```

Ожидание: оба файла зелёные (compat-routes подтверждает, что вынос `readRows` ничего не сломал).

- [ ] **Step 6: Commit**

```bash
git add ops/db/migrations/019_bonuses.sql ops/api/src/compat-rows.js ops/api/src/routes/compat.js ops/api/test/bonuses-routes.test.js
git commit -m "Add bonus tables and shared compat rows reader"
```

---

### Task 2: Дата завершения заказа в API

**Files:**
- Modify: `ops/api/src/routes/compat.js` (`executeAtomicOrderSave`, `executeMutation`)
- Test: `ops/api/test/bonuses-routes.test.js`

**Interfaces:**
- Produces: `export function stampCompletedAt(row, previous, nowIso)` — мутирует `row`: если `row.status === 'completed'` и `row.completed_at` пуст, ставит `previous?.completed_at || nowIso`.

- [ ] **Step 1: Тест на `stampCompletedAt` и путь order-save**

Добавить в `ops/api/test/bonuses-routes.test.js`:

```js
import { stampCompletedAt } from '../src/routes/compat.js';

test('stampCompletedAt ставит дату при первом переходе в completed и не перезаписывает', () => {
  const row = { id: 1, status: 'completed' };
  stampCompletedAt(row, { status: 'in_production' }, '2026-09-15T10:00:00.000Z');
  assert.equal(row.completed_at, '2026-09-15T10:00:00.000Z');

  const again = { id: 1, status: 'completed', completed_at: '2026-09-01T00:00:00.000Z' };
  stampCompletedAt(again, row, '2026-09-15T10:00:00.000Z');
  assert.equal(again.completed_at, '2026-09-01T00:00:00.000Z');

  const kept = { id: 1, status: 'completed' };
  stampCompletedAt(kept, { completed_at: '2026-08-20T00:00:00.000Z' }, '2026-09-15T10:00:00.000Z');
  assert.equal(kept.completed_at, '2026-08-20T00:00:00.000Z');

  const draft = { id: 2, status: 'draft' };
  stampCompletedAt(draft, null, '2026-09-15T10:00:00.000Z');
  assert.equal(draft.completed_at, undefined);
});

test('POST /api/compat/order-save проставляет completed_at', async (t) => {
  const { port, cookie } = await setup(t);
  const id = Date.now();
  await requestJson(port, 'POST', '/api/compat/order-save', { order: { id, order_name: 'x', status: 'in_production' }, items: [] }, cookie);
  const res = await requestJson(port, 'POST', '/api/compat/order-save', { order: { id, order_name: 'x', status: 'completed' }, items: [] }, cookie);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.match(String(body.data.order.completed_at), /^\d{4}-\d{2}-\d{2}T/);
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

```bash
cd ops/api && TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" node --test test/bonuses-routes.test.js
```

Ожидание: FAIL, `stampCompletedAt` не экспортирован.

- [ ] **Step 3: Реализовать**

В `ops/api/src/routes/compat.js` рядом с `syncOrderStatusSnapshot`:

```js
export function stampCompletedAt(row, previous, nowIso) {
  if (!row || String(row.status || '').trim().toLowerCase() !== 'completed') return row;
  if (row.completed_at) return row;
  row.completed_at = previous?.completed_at || nowIso;
  return row;
}
```

В `executeAtomicOrderSave` после строки `savedOrder.updated_at = incomingOrder.updated_at || nowIso;`:

```js
  stampCompletedAt(savedOrder, existingOrder, nowIso);
```

В `executeMutation`, ветка `update`, внутри цикла перед `writeRow`:

```js
      if (table === 'orders') stampCompletedAt(next, current, new Date().toISOString());
```

Ветка `upsert` (внутри `if (body.action === 'upsert' && conflictIndex >= 0)`), перед `writeRow`:

```js
        if (table === 'orders') stampCompletedAt(next, current, new Date().toISOString());
```

Ветка вставки, перед `await writeRow(client, table, primaryKey, incoming);`:

```js
      if (table === 'orders') stampCompletedAt(incoming, null, new Date().toISOString());
```

- [ ] **Step 4: Запустить тесты**

```bash
cd ops/api && TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" node --test test/bonuses-routes.test.js test/compat-routes.test.js
```

Ожидание: PASS.

- [ ] **Step 5: Commit**

```bash
git add ops/api/src/routes/compat.js ops/api/test/bonuses-routes.test.js
git commit -m "Stamp completed_at on first transition to completed"
```

---

### Task 3: Чистые функции: период, рабочие дни, шкала

**Files:**
- Create: `ops/api/src/bonuses/calc.js`
- Test: `ops/api/test/bonuses-calc.test.js`

**Interfaces:**
- Produces: `periodBounds(period)` → `{ year, q, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }`; бросает `Error('INVALID_PERIOD')` на плохом формате.
- Produces: `holidaySet(settings)` → `Set<string>` из `settings.production_holidays` (разделители пробел/запятая/точка с запятой).
- Produces: `workingDays(from, to, holidays)` → число рабочих дней включительно.
- Produces: `elapsedWorkingShare(period, todayYmd, holidays)` → число 0..1.
- Produces: `achievement(fact, thresholds, direction, ladder)` → число или `null`.
- Produces: `DEFAULT_LADDER`, `DEFAULT_METRICS`.

- [ ] **Step 1: Тесты**

`ops/api/test/bonuses-calc.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  periodBounds, holidaySet, workingDays, elapsedWorkingShare, achievement, DEFAULT_LADDER,
} from '../src/bonuses/calc.js';

test('periodBounds: 2026-Q3 → 01.07–30.09', () => {
  assert.deepEqual(periodBounds('2026-Q3'), { year: 2026, q: 3, from: '2026-07-01', to: '2026-09-30' });
  assert.deepEqual(periodBounds('2026-Q1'), { year: 2026, q: 1, from: '2026-01-01', to: '2026-03-31' });
  assert.throws(() => periodBounds('2026-Q5'), /INVALID_PERIOD/);
  assert.throws(() => periodBounds('Q3'), /INVALID_PERIOD/);
});

test('holidaySet и workingDays учитывают выходные и праздники', () => {
  const holidays = holidaySet({ production_holidays: '2026-09-07, 2026-09-08;2026-13-99' });
  assert.equal(holidays.size, 2);
  // 7–11 сентября 2026: пн–пт, два праздника → 3 рабочих дня
  assert.equal(workingDays('2026-09-07', '2026-09-11', holidays), 3);
  // 12–13 сентября: сб, вс → 0
  assert.equal(workingDays('2026-09-12', '2026-09-13', holidays), 0);
});

test('elapsedWorkingShare: до начала 0, после конца 1, середина по рабочим дням', () => {
  const none = new Set();
  assert.equal(elapsedWorkingShare('2026-Q3', '2026-06-30', none), 0);
  assert.equal(elapsedWorkingShare('2026-Q3', '2026-10-05', none), 1);
  const share = elapsedWorkingShare('2026-Q3', '2026-09-09', none);
  const total = workingDays('2026-07-01', '2026-09-30', none);
  const done = workingDays('2026-07-01', '2026-09-09', none);
  assert.equal(share, done / total);
});

test('achievement: шкала больше-лучше', () => {
  const thr = { min: 1360, target: 1600, max: 1840 };
  assert.equal(achievement(1000, thr, 'higher', DEFAULT_LADDER), 0);
  assert.equal(achievement(1360, thr, 'higher', DEFAULT_LADDER), 0.5);
  assert.equal(achievement(1480, thr, 'higher', DEFAULT_LADDER), 0.75);
  assert.equal(achievement(1600, thr, 'higher', DEFAULT_LADDER), 1);
  assert.ok(Math.abs(achievement(1700, thr, 'higher', DEFAULT_LADDER) - 1.2083) < 0.001);
  assert.equal(achievement(1840, thr, 'higher', DEFAULT_LADDER), 1.5);
  assert.equal(achievement(5000, thr, 'higher', DEFAULT_LADDER), 1.5);
  assert.equal(achievement(null, thr, 'higher', DEFAULT_LADDER), null);
});

test('achievement: шкала меньше-лучше (переделки)', () => {
  const thr = { min: 0.08, target: 0.05, max: 0.02 };
  assert.equal(achievement(0.10, thr, 'lower', DEFAULT_LADDER), 0);
  assert.equal(achievement(0.08, thr, 'lower', DEFAULT_LADDER), 0.5);
  assert.equal(achievement(0.05, thr, 'lower', DEFAULT_LADDER), 1);
  assert.ok(Math.abs(achievement(0.04, thr, 'lower', DEFAULT_LADDER) - 1.1667) < 0.001);
  assert.equal(achievement(0.01, thr, 'lower', DEFAULT_LADDER), 1.5);
});

test('achievement: совпадающие пороги не делят на ноль', () => {
  assert.equal(achievement(10, { min: 10, target: 10, max: 10 }, 'higher', DEFAULT_LADDER), 1.5);
  assert.equal(achievement(9, { min: 10, target: 10, max: 10 }, 'higher', DEFAULT_LADDER), 0);
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

```bash
cd ops/api && node --test test/bonuses-calc.test.js
```

Ожидание: FAIL, модуль не найден.

- [ ] **Step 3: Реализация**

`ops/api/src/bonuses/calc.js` (начало файла; функции расчёта периода добавятся в Task 4):

```js
// Чистые функции расчёта бонусов. Без БД и без Express.

export const DEFAULT_LADDER = { below_min: 0, min: 0.5, target: 1, max: 1.5 };

export const DEFAULT_METRICS = [
  { key: 'output_hours', weight: 0.5, direction: 'higher' },
  { key: 'productivity', weight: 0.25, direction: 'higher' },
  { key: 'on_time_share', weight: 0.15, direction: 'higher' },
  { key: 'rework_share', weight: 0.1, direction: 'lower' },
];

export const METRIC_LABELS = {
  output_hours: 'Выпуск, нормо-часы',
  productivity: 'Производительность',
  on_time_share: 'В срок',
  rework_share: 'Переделки',
};

const QUARTER_MONTHS = { 1: ['01-01', '03-31'], 2: ['04-01', '06-30'], 3: ['07-01', '09-30'], 4: ['10-01', '12-31'] };

export function periodBounds(period) {
  const match = /^(\d{4})-Q([1-4])$/.exec(String(period || '').trim());
  if (!match) throw new Error('INVALID_PERIOD');
  const year = Number(match[1]);
  const q = Number(match[2]);
  const [from, to] = QUARTER_MONTHS[q];
  return { year, q, from: `${year}-${from}`, to: `${year}-${to}` };
}

export function holidaySet(settings) {
  const raw = String(settings?.production_holidays || '').trim();
  if (!raw) return new Set();
  return new Set(raw.split(/[\s,;]+/).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)));
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function parseYmd(value) {
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function workingDays(from, to, holidays = new Set()) {
  let count = 0;
  for (let cursor = parseYmd(from); ymd(cursor) <= String(to).slice(0, 10); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) continue;
    if (holidays.has(ymd(cursor))) continue;
    count += 1;
  }
  return count;
}

export function elapsedWorkingShare(period, todayYmd, holidays = new Set()) {
  const { from, to } = periodBounds(period);
  const today = String(todayYmd).slice(0, 10);
  if (today < from) return 0;
  if (today > to) return 1;
  const total = workingDays(from, to, holidays);
  if (total === 0) return 1;
  return workingDays(from, today, holidays) / total;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function achievement(fact, thresholds, direction = 'higher', ladder = DEFAULT_LADDER) {
  if (fact === null || fact === undefined || !Number.isFinite(Number(fact))) return null;
  const sign = direction === 'lower' ? -1 : 1;
  const x = Number(fact) * sign;
  const a = Number(thresholds.min) * sign;
  const b = Number(thresholds.target) * sign;
  const c = Number(thresholds.max) * sign;
  if (x < a) return Number(ladder.below_min);
  if (x >= c) return Number(ladder.max);
  if (x < b) return b === a ? Number(ladder.min) : lerp(Number(ladder.min), Number(ladder.target), (x - a) / (b - a));
  return c === b ? Number(ladder.target) : lerp(Number(ladder.target), Number(ladder.max), (x - b) / (c - b));
}
```

- [ ] **Step 4: Запустить тесты**

```bash
cd ops/api && node --test test/bonuses-calc.test.js
```

Ожидание: PASS.

- [ ] **Step 5: Commit**

```bash
git add ops/api/src/bonuses/calc.js ops/api/test/bonuses-calc.test.js
git commit -m "Add bonus period, working days and ladder helpers"
```

---

### Task 4: Расчёт квартала производства и подсказка целей

**Files:**
- Modify: `ops/api/src/bonuses/calc.js`
- Test: `ops/api/test/bonuses-calc.test.js`

**Interfaces:**
- Consumes: `periodBounds`, `holidaySet`, `elapsedWorkingShare`, `achievement`, `DEFAULT_METRICS`, `METRIC_LABELS`.
- Produces: `orderCompletionDate(order, entriesForOrder)` → `{ date: 'YYYY-MM-DD' | null, estimated: boolean }`.
- Produces: `isCommercialOrder(order)`, `orderPurpose(order)`.
- Produces: `computeProductionPeriod(input)` где `input = { period, today, status, scheme, targets, orders, timeEntries, settings, stockApprovals }` → `ProductionResult`:

```js
{
  period, schemeId, employeeId, status, targetAmount, weightsTotal,
  metrics: [{ key, label, direction, weight, thresholds, fact, forecast, achievement, payout, available }],
  amountComputed,
  warnings: [{ code, count, hours, orderIds }],
  orders: [{ id, name, purpose, hoursPlan, hoursFact, deadline, completedAt, estimated, onTime, approved, included }],
}
```
- Produces: `suggestProductionTargets({ period, settings })` → `{ targets: { output_hours, productivity, on_time_share, rework_share }, source: 'plan' | 'formula' }`.

- [ ] **Step 1: Тесты с фикстурой**

Добавить в `ops/api/test/bonuses-calc.test.js`:

```js
import { computeProductionPeriod, suggestProductionTargets, orderCompletionDate } from '../src/bonuses/calc.js';

const scheme = {
  id: 7, employee_id: 5, target_amount: 100000,
  metrics_json: [
    { key: 'output_hours', weight: 0.5, direction: 'higher' },
    { key: 'productivity', weight: 0.25, direction: 'higher' },
    { key: 'on_time_share', weight: 0.15, direction: 'higher' },
    { key: 'rework_share', weight: 0.1, direction: 'lower' },
  ],
  ladder_json: { below_min: 0, min: 0.5, target: 1, max: 1.5 },
};
const targets = {
  output_hours: { min: 1360, target: 1600, max: 1840 },
  productivity: { min: 0.9, target: 1.0, max: 1.15 },
  on_time_share: { min: 0.7, target: 0.85, max: 0.95 },
  rework_share: { min: 0.08, target: 0.05, max: 0.02 },
};

function fixture() {
  const orders = [
    // 9 коммерческих завершённых в Q3, 8 в срок, 1 с опозданием; 1700 нормо-часов суммарно
    ...Array.from({ length: 9 }, (_, i) => ({
      id: 100 + i, order_name: `Заказ ${i}`, status: 'completed', production_purpose: 'commercial',
      total_hours_plan: i === 0 ? 300 : 175, deadline: '2026-09-20',
      completed_at: i === 8 ? '2026-09-25T10:00:00.000Z' : '2026-09-10T10:00:00.000Z',
    })),
    // складской заказ, утверждён → входит (в 1700 не входит, проверяем отдельно)
    { id: 200, order_name: 'Образцы', status: 'completed', production_purpose: 'stock_sample', total_hours_plan: 40, completed_at: '2026-08-01T10:00:00.000Z' },
    // складской, не утверждён → не входит
    { id: 201, order_name: 'Сток', status: 'completed', production_purpose: 'stock_sample', total_hours_plan: 50, completed_at: '2026-08-02T10:00:00.000Z' },
    // завершён до периода → не входит
    { id: 300, order_name: 'Старый', status: 'completed', production_purpose: 'commercial', total_hours_plan: 500, deadline: '2026-06-01', completed_at: '2026-06-20T10:00:00.000Z' },
    // без нормо-часов → предупреждение
    { id: 301, order_name: 'Без часов', status: 'completed', production_purpose: 'commercial', total_hours_plan: 0, deadline: '2026-09-01', completed_at: '2026-09-02T10:00:00.000Z' },
    // без дедлайна → предупреждение, в выпуск входит
    { id: 302, order_name: 'Без дедлайна', status: 'completed', production_purpose: 'commercial', total_hours_plan: 10, completed_at: '2026-09-03T10:00:00.000Z' },
    // переделка, часы табеля периода идут в rework_share
    { id: 400, order_name: 'Переделка', status: 'in_production', production_purpose: 'rework', total_hours_plan: 30 },
  ];
  const timeEntries = [
    // табель по коммерческим завершённым: 1710/1.05 ≈ 1628.57 ч, распределим: 1628.57 на заказ 100
    { id: 1, employee_id: 5, date: '2026-08-05', hours: 1628.57, order_id: 100 },
    { id: 2, employee_id: 5, date: '2026-08-06', hours: 20, order_id: 200 },
    // переделки в периоде: 4% от (rework + commercial period hours) → 1628.57 коммерческих в периоде: rework = 0.04/0.96*1628.57 ≈ 67.86
    { id: 3, employee_id: 5, date: '2026-08-07', hours: 67.86, order_id: 400 },
    // без заказа → предупреждение 3 ч
    { id: 4, employee_id: 6, date: '2026-08-08', hours: 3, order_id: null },
    // вне периода, не влияет на переделки
    { id: 5, employee_id: 5, date: '2026-06-01', hours: 100, order_id: 400 },
  ];
  return { orders, timeEntries };
}

test('computeProductionPeriod: проверочный пример спеки', () => {
  const { orders, timeEntries } = fixture();
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme, targets, orders, timeEntries,
    settings: { production_holidays: '' }, stockApprovals: new Set(['200']),
  });
  const by = Object.fromEntries(result.metrics.map((m) => [m.key, m]));
  assert.equal(by.output_hours.fact, 1750); // 1700 коммерческих + 40 склад + 10 без дедлайна
  assert.ok(Math.abs(by.productivity.fact - 1750 / 1648.57) < 0.001);
  assert.ok(Math.abs(by.on_time_share.fact - 8 / 9) < 0.001);
  assert.ok(Math.abs(by.rework_share.fact - 0.04) < 0.001);
  assert.equal(result.warnings.find((w) => w.code === 'unmarked_hours').hours, 3);
  assert.deepEqual(result.warnings.find((w) => w.code === 'no_hours').orderIds, [301]);
  assert.deepEqual(result.warnings.find((w) => w.code === 'no_deadline').orderIds, [302]);
  assert.equal(result.orders.find((o) => o.id === 201).included, false);
  assert.equal(result.orders.find((o) => o.id === 300), undefined);
  assert.equal(result.metrics.every((m) => m.available), true);
  assert.ok(result.amountComputed > 100000 && result.amountComputed < 130000);
});

test('computeProductionPeriod: ровно 120 000 ₽ на числах спеки', () => {
  // Фикстура подогнана под факты 1700 / 1.05 / 0.9 / 0.04
  const orders = [
    ...Array.from({ length: 10 }, (_, i) => ({
      id: i + 1, order_name: `З${i}`, status: 'completed', production_purpose: 'commercial',
      total_hours_plan: 170, deadline: '2026-09-20',
      completed_at: i === 9 ? '2026-09-25T00:00:00.000Z' : '2026-09-10T00:00:00.000Z',
    })),
    { id: 99, status: 'in_production', production_purpose: 'rework', total_hours_plan: 1 },
  ];
  const commercialHours = 1700 / 1.05;
  const reworkHours = (0.04 / 0.96) * commercialHours;
  const timeEntries = [
    { id: 1, employee_id: 5, date: '2026-08-01', hours: commercialHours, order_id: 1 },
    { id: 2, employee_id: 5, date: '2026-08-02', hours: reworkHours, order_id: 99 },
  ];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme, targets, orders, timeEntries,
    settings: {}, stockApprovals: new Set(),
  });
  assert.equal(result.amountComputed, 120000);
});

test('computeProductionPeriod: пустой табель обнуляет производительность', () => {
  const orders = [{ id: 1, status: 'completed', production_purpose: 'commercial', total_hours_plan: 100, deadline: '2026-09-20', completed_at: '2026-09-10T00:00:00.000Z' }];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme, targets, orders, timeEntries: [], settings: {}, stockApprovals: new Set(),
  });
  const productivity = result.metrics.find((m) => m.key === 'productivity');
  assert.equal(productivity.available, false);
  assert.equal(productivity.payout, 0);
  assert.ok(result.warnings.some((w) => w.code === 'no_timesheet'));
});

test('computeProductionPeriod: прогноз выпуска по доле рабочих дней', () => {
  const orders = [{ id: 1, status: 'completed', production_purpose: 'commercial', total_hours_plan: 800, deadline: '2026-09-20', completed_at: '2026-08-10T00:00:00.000Z' }];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-08-14', status: 'open', scheme, targets, orders, timeEntries: [], settings: {}, stockApprovals: new Set(),
  });
  const output = result.metrics.find((m) => m.key === 'output_hours');
  const share = 32 / 66; // рабочие дни 01.07–14.08 / 01.07–30.09 без праздников
  assert.ok(Math.abs(output.forecast - 800 / share) < 1);
});

test('orderCompletionDate: completed_at, иначе последняя дата табеля, иначе updated_at', () => {
  assert.deepEqual(orderCompletionDate({ completed_at: '2026-09-10T10:00:00.000Z' }, []), { date: '2026-09-10', estimated: false });
  assert.deepEqual(orderCompletionDate({ updated_at: '2026-09-30T10:00:00.000Z' }, [{ date: '2026-09-01' }, { date: '2026-09-12' }]), { date: '2026-09-12', estimated: true });
  assert.deepEqual(orderCompletionDate({ updated_at: '2026-09-30T10:00:00.000Z' }, []), { date: '2026-09-30', estimated: true });
  assert.deepEqual(orderCompletionDate({}, []), { date: null, estimated: true });
});

test('suggestProductionTargets: из сезонного плана, иначе формула', () => {
  const fromPlan = suggestProductionTargets({ period: '2026-Q3', settings: { seasonal_load_plan_json: JSON.stringify({ Q1: 768, Q2: 1152, Q3: 1632, Q4: 1824 }) } });
  assert.equal(fromPlan.source, 'plan');
  assert.deepEqual(fromPlan.targets.output_hours, { min: 1387, target: 1632, max: 1877 });
  assert.deepEqual(fromPlan.targets.rework_share, { min: 0.08, target: 0.05, max: 0.02 });
  const fromFormula = suggestProductionTargets({ period: '2026-Q3', settings: { workers_count: 4, hours_per_worker: 180, work_load_ratio: 0.7 } });
  assert.equal(fromFormula.source, 'formula');
  assert.equal(fromFormula.targets.output_hours.target, 1512);
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

```bash
cd ops/api && node --test test/bonuses-calc.test.js
```

Ожидание: FAIL, функции не экспортированы.

- [ ] **Step 3: Реализация**

Дописать в `ops/api/src/bonuses/calc.js`:

```js
const NON_COMMERCIAL = new Set(['rework', 'stock_sample']);

export function orderPurpose(order) {
  const key = String(order?.production_purpose || '').trim().toLowerCase();
  return key || 'commercial';
}

export function isCommercialOrder(order) {
  return !NON_COMMERCIAL.has(orderPurpose(order));
}

function isAlive(order) {
  const status = String(order?.status || '').trim().toLowerCase();
  return !order?.deleted_at && status !== 'deleted' && status !== 'cancelled';
}

function isCompleted(order) {
  return String(order?.status || '').trim().toLowerCase() === 'completed';
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function day(value) {
  const s = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function orderCompletionDate(order, entriesForOrder = []) {
  const explicit = day(order?.completed_at);
  if (explicit) return { date: explicit, estimated: false };
  const lastEntry = entriesForOrder.map((e) => day(e?.date)).filter(Boolean).sort().pop();
  if (lastEntry) return { date: lastEntry, estimated: true };
  return { date: day(order?.updated_at), estimated: true };
}

function groupEntriesByOrder(timeEntries) {
  const map = new Map();
  for (const entry of timeEntries) {
    if (entry?.order_id === null || entry?.order_id === undefined || entry.order_id === '') continue;
    const key = String(entry.order_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  }
  return map;
}

function sumHours(entries) {
  return entries.reduce((acc, e) => acc + num(e?.hours), 0);
}

function roundTo(value, digits) {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}

export function computeProductionPeriod(input) {
  const { period, today, status = 'open', scheme, targets, orders, timeEntries, settings, stockApprovals } = input;
  const { from, to } = periodBounds(period);
  const holidays = holidaySet(settings);
  const metricsDef = Array.isArray(scheme.metrics_json) && scheme.metrics_json.length ? scheme.metrics_json : DEFAULT_METRICS;
  const ladder = scheme.ladder_json || DEFAULT_LADDER;
  const targetAmount = num(scheme.target_amount);
  const approvals = stockApprovals instanceof Set ? stockApprovals : new Set((stockApprovals || []).map(String));
  const entriesByOrder = groupEntriesByOrder(timeEntries);
  const inPeriod = (d) => d !== null && d >= from && d <= to;

  const warnings = [];
  const detail = [];
  let outputHours = 0;
  let timesheetOnIncluded = 0;
  let onTimeCount = 0;
  let deadlineCount = 0;
  const noHours = [];
  const noDeadline = [];
  const estimated = [];

  for (const order of orders) {
    if (!isAlive(order) || !isCompleted(order)) continue;
    const purpose = orderPurpose(order);
    if (purpose === 'rework') continue;
    const entries = entriesByOrder.get(String(order.id)) || [];
    const completion = orderCompletionDate(order, entries);
    if (!inPeriod(completion.date)) continue;

    const hoursPlan = num(order.total_hours_plan);
    const hoursFact = sumHours(entries);
    const deadline = day(order.deadline);
    const isStock = purpose === 'stock_sample';
    const approved = isStock ? approvals.has(String(order.id)) : null;
    const onTime = deadline ? completion.date <= deadline : null;
    let included = hoursPlan > 0 && (!isStock || approved);

    if (hoursPlan <= 0) noHours.push(order.id);
    if (completion.estimated) estimated.push(order.id);

    if (!isStock) {
      if (deadline) {
        deadlineCount += 1;
        if (onTime) onTimeCount += 1;
      } else {
        noDeadline.push(order.id);
      }
    }
    if (included) {
      outputHours += hoursPlan;
      timesheetOnIncluded += hoursFact;
    }
    detail.push({
      id: order.id, name: String(order.order_name || ''), purpose, hoursPlan, hoursFact,
      deadline, completedAt: completion.date, estimated: completion.estimated, onTime, approved, included,
    });
  }

  let reworkHours = 0;
  let commercialPeriodHours = 0;
  let unmarkedHours = 0;
  const orderById = new Map(orders.map((o) => [String(o.id), o]));
  for (const entry of timeEntries) {
    const d = day(entry?.date);
    if (!inPeriod(d)) continue;
    if (entry?.order_id === null || entry?.order_id === undefined || entry.order_id === '') {
      unmarkedHours += num(entry.hours);
      continue;
    }
    const order = orderById.get(String(entry.order_id));
    if (!order) continue;
    const purpose = orderPurpose(order);
    if (purpose === 'rework') reworkHours += num(entry.hours);
    else if (purpose !== 'stock_sample') commercialPeriodHours += num(entry.hours);
  }

  if (noHours.length) warnings.push({ code: 'no_hours', count: noHours.length, hours: 0, orderIds: noHours });
  if (noDeadline.length) warnings.push({ code: 'no_deadline', count: noDeadline.length, hours: 0, orderIds: noDeadline });
  if (estimated.length) warnings.push({ code: 'estimated_dates', count: estimated.length, hours: 0, orderIds: estimated });
  if (unmarkedHours > 0) warnings.push({ code: 'unmarked_hours', count: 0, hours: roundTo(unmarkedHours, 2), orderIds: [] });
  if (outputHours > 0 && timesheetOnIncluded === 0) warnings.push({ code: 'no_timesheet', count: 0, hours: 0, orderIds: [] });

  const facts = {
    output_hours: { fact: roundTo(outputHours, 2), available: true },
    productivity: timesheetOnIncluded > 0
      ? { fact: roundTo(outputHours / timesheetOnIncluded, 4), available: true }
      : { fact: null, available: false },
    on_time_share: deadlineCount > 0
      ? { fact: roundTo(onTimeCount / deadlineCount, 4), available: true }
      : { fact: null, available: false },
    rework_share: (reworkHours + commercialPeriodHours) > 0
      ? { fact: roundTo(reworkHours / (reworkHours + commercialPeriodHours), 4), available: true }
      : { fact: null, available: false },
  };

  const share = status === 'open' ? elapsedWorkingShare(period, today, holidays) : 1;
  let amount = 0;
  let weightsTotal = 0;
  const metrics = metricsDef.map((def) => {
    const thresholds = targets?.[def.key] || null;
    const { fact, available } = facts[def.key] || { fact: null, available: false };
    const ach = available && thresholds ? achievement(fact, thresholds, def.direction, ladder) : null;
    const payout = ach === null ? 0 : Math.round(targetAmount * num(def.weight) * ach);
    amount += payout;
    weightsTotal += num(def.weight);
    const forecast = def.key === 'output_hours' && status === 'open' && share > 0 && share < 1
      ? roundTo(fact / share, 0)
      : null;
    return {
      key: def.key, label: METRIC_LABELS[def.key] || def.key, direction: def.direction, weight: num(def.weight),
      thresholds, fact, forecast, achievement: ach === null ? null : roundTo(ach, 4), payout, available: available && !!thresholds,
    };
  });

  return {
    period, schemeId: scheme.id, employeeId: scheme.employee_id, status, targetAmount,
    weightsTotal: roundTo(weightsTotal, 4), metrics, amountComputed: amount, warnings, orders: detail,
  };
}

export function suggestProductionTargets({ period, settings }) {
  const { q } = periodBounds(period);
  let target = 0;
  let source = 'formula';
  try {
    const stored = JSON.parse(settings?.seasonal_load_plan_json || 'null');
    if (stored && num(stored[`Q${q}`]) > 0) {
      target = Math.round(num(stored[`Q${q}`]));
      source = 'plan';
    }
  } catch {
    target = 0;
  }
  if (!target) {
    target = Math.round(num(settings?.workers_count) * num(settings?.hours_per_worker) * num(settings?.work_load_ratio) * 3);
  }
  return {
    source,
    targets: {
      output_hours: { min: Math.round(target * 0.85), target, max: Math.round(target * 1.15) },
      productivity: { min: 0.9, target: 1.0, max: 1.15 },
      on_time_share: { min: 0.7, target: 0.85, max: 0.95 },
      rework_share: { min: 0.08, target: 0.05, max: 0.02 },
    },
  };
}
```

- [ ] **Step 4: Запустить тесты**

```bash
cd ops/api && node --test test/bonuses-calc.test.js
```

Ожидание: PASS. Если тест «ровно 120 000» даёт 119 999 или 120 001 из-за плавающей точки, поправить фикстуру часов (не округление в коде).

- [ ] **Step 5: Commit**

```bash
git add ops/api/src/bonuses/calc.js ops/api/test/bonuses-calc.test.js
git commit -m "Compute production bonus period and suggest targets"
```

---

### Task 5: Годовой добор

**Files:**
- Modify: `ops/api/src/bonuses/calc.js`
- Test: `ops/api/test/bonuses-calc.test.js`

**Interfaces:**
- Produces: `computeYear({ year, scheme, quarters })`, где `quarters = [{ period, thresholds: {min,target,max} | null, fact: number | null, paidOutputPayout: number }]` → `{ year, factSum, thresholdsSum, achievement, yearComponent, paidSum, topUp, quartersCounted }`.

- [ ] **Step 1: Тест**

```js
import { computeYear } from '../src/bonuses/calc.js';

test('computeYear: добор по выпуску', () => {
  const result = computeYear({
    year: 2026, scheme,
    quarters: [
      { period: '2026-Q1', thresholds: { min: 650, target: 768, max: 880 }, fact: 600, paidOutputPayout: 0 },
      { period: '2026-Q2', thresholds: { min: 980, target: 1152, max: 1320 }, fact: 1152, paidOutputPayout: 50000 },
      { period: '2026-Q3', thresholds: { min: 1387, target: 1632, max: 1877 }, fact: 1700, paidOutputPayout: 52083 },
      { period: '2026-Q4', thresholds: { min: 1550, target: 1824, max: 2100 }, fact: 1924, paidOutputPayout: 59058 },
    ],
  });
  assert.equal(result.factSum, 5376);
  assert.equal(result.thresholdsSum.target, 5376);
  assert.equal(result.achievement, 1);
  assert.equal(result.yearComponent, 200000); // 4 × 100000 × 0.5 × 1.0
  assert.equal(result.paidSum, 161141);
  assert.equal(result.topUp, 38859);
  assert.equal(result.quartersCounted, 4);
});

test('computeYear: кварталы без целей не считаются, добор не отрицательный', () => {
  const result = computeYear({
    year: 2026, scheme,
    quarters: [
      { period: '2026-Q3', thresholds: { min: 1387, target: 1632, max: 1877 }, fact: 1877, paidOutputPayout: 75000 },
      { period: '2026-Q4', thresholds: null, fact: null, paidOutputPayout: 0 },
    ],
  });
  assert.equal(result.quartersCounted, 1);
  assert.equal(result.yearComponent, 75000);
  assert.equal(result.topUp, 0);
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

```bash
cd ops/api && node --test test/bonuses-calc.test.js
```

- [ ] **Step 3: Реализация**

```js
export function computeYear({ year, scheme, quarters }) {
  const metricsDef = Array.isArray(scheme.metrics_json) && scheme.metrics_json.length ? scheme.metrics_json : DEFAULT_METRICS;
  const outputDef = metricsDef.find((m) => m.key === 'output_hours') || DEFAULT_METRICS[0];
  const ladder = scheme.ladder_json || DEFAULT_LADDER;
  const counted = quarters.filter((q) => q.thresholds && q.fact !== null && q.fact !== undefined);
  const sum = (key) => counted.reduce((acc, q) => acc + num(q.thresholds[key]), 0);
  const thresholdsSum = { min: sum('min'), target: sum('target'), max: sum('max') };
  const factSum = roundTo(counted.reduce((acc, q) => acc + num(q.fact), 0), 2);
  const ach = counted.length ? achievement(factSum, thresholdsSum, outputDef.direction, ladder) : null;
  const yearComponent = ach === null ? 0 : Math.round(counted.length * num(scheme.target_amount) * num(outputDef.weight) * ach);
  const paidSum = quarters.reduce((acc, q) => acc + num(q.paidOutputPayout), 0);
  return {
    year, factSum, thresholdsSum, achievement: ach === null ? null : roundTo(ach, 4),
    yearComponent, paidSum, topUp: Math.max(0, yearComponent - paidSum), quartersCounted: counted.length,
  };
}
```

- [ ] **Step 4: Запустить тесты**

```bash
cd ops/api && node --test test/bonuses-calc.test.js
```

Ожидание: PASS.

- [ ] **Step 5: Commit**

```bash
git add ops/api/src/bonuses/calc.js ops/api/test/bonuses-calc.test.js
git commit -m "Add annual output top-up calculation"
```

---

### Task 6: Хранилище, загрузка legacy-данных, маршруты схем и целей

**Files:**
- Create: `ops/api/src/bonuses/store.js`
- Create: `ops/api/src/bonuses/legacy.js`
- Create: `ops/api/src/routes/bonuses.js`
- Modify: `ops/api/src/server.js:29-70`
- Test: `ops/api/test/bonuses-routes.test.js`

**Interfaces:**
- Consumes: `readCompatRows`, `getPool`, `withTransaction`, `requireAuth`, `requireRole`, `suggestProductionTargets`.
- Produces (`store.js`): `listSchemes()`, `getSchemeById(id)`, `upsertScheme(employeeId, payload)`, `getTargets(schemeId, period)` → `{ [metric_key]: {min,target,max} }`, `upsertTargets(schemeId, period, targets)`, `listStockApprovals(period)` → `Set<string>`, `setStockApproval(period, orderId, approved, by)`, `getResult(schemeId, period)`, `saveResult(row)`.
- Produces (`legacy.js`): `loadLegacyBonusData(client)` → `{ orders, timeEntries, employees, settings }` где `settings` = объект `{ key: value }` из строк `settings`.
- Produces: маршруты `GET /api/bonuses/schemes`, `PUT /api/bonuses/schemes/:employeeId`, `GET /api/bonuses/periods/:period/suggest/:schemeId`, `PUT /api/bonuses/periods/:period/targets/:schemeId`, `GET /api/bonuses/employees` (активные legacy-сотрудники: `{ id, name, role }`).

- [ ] **Step 1: Тесты маршрутов**

Добавить в `ops/api/test/bonuses-routes.test.js`:

```js
test('роль user получает 403 на /api/bonuses', async (t) => {
  const { port, cookie } = await setup(t, 'user');
  const res = await requestJson(port, 'GET', '/api/bonuses/schemes', undefined, cookie);
  assert.equal(res.status, 403);
});

test('без сессии 401', async (t) => {
  const port = await startServer(t);
  const res = await fetch(`http://127.0.0.1:${port}/api/bonuses/schemes`);
  assert.equal(res.status, 401);
});

test('PUT схема, GET схемы, подсказка и сохранение целей', async (t) => {
  const { port, cookie } = await setup(t);
  const employeeId = Date.now();
  await putCompatRow('employees', { id: employeeId, name: 'Лёша', role: 'production', is_active: true });
  await putCompatRow('settings', { key: 'seasonal_load_plan_json', value: JSON.stringify({ Q1: 768, Q2: 1152, Q3: 1632, Q4: 1824 }) });

  const put = await requestJson(port, 'PUT', `/api/bonuses/schemes/${employeeId}`, { kind: 'production', target_amount: 100000 }, cookie);
  assert.equal(put.status, 200);
  const scheme = (await put.json()).data;
  assert.equal(scheme.kind, 'production');
  assert.equal(scheme.metrics_json.length, 4);

  const list = await requestJson(port, 'GET', '/api/bonuses/schemes', undefined, cookie);
  const schemes = (await list.json()).data;
  assert.ok(schemes.some((s) => s.id === scheme.id && s.employee_name === 'Лёша'));

  const suggest = await requestJson(port, 'GET', `/api/bonuses/periods/2026-Q3/suggest/${scheme.id}`, undefined, cookie);
  const suggestion = (await suggest.json()).data;
  assert.equal(suggestion.source, 'plan');
  assert.equal(suggestion.targets.output_hours.target, 1632);

  const save = await requestJson(port, 'PUT', `/api/bonuses/periods/2026-Q3/targets/${scheme.id}`, { targets: suggestion.targets }, cookie);
  assert.equal(save.status, 200);
  const saved = (await save.json()).data;
  assert.equal(saved.output_hours.target, 1632);

  const bad = await requestJson(port, 'PUT', `/api/bonuses/periods/2026-Q9/targets/${scheme.id}`, { targets: suggestion.targets }, cookie);
  assert.equal(bad.status, 400);
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

```bash
cd ops/api && TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" node --test test/bonuses-routes.test.js
```

Ожидание: 404 вместо ожидаемых кодов.

- [ ] **Step 3: legacy.js**

```js
import { readCompatRows } from '../compat-rows.js';

export async function loadLegacyBonusData(client) {
  const [orders, timeEntries, employees, settingsRows] = await Promise.all([
    readCompatRows(client, 'orders'),
    readCompatRows(client, 'time_entries'),
    readCompatRows(client, 'employees'),
    readCompatRows(client, 'settings'),
  ]);
  const settings = {};
  for (const row of settingsRows) {
    if (row && row.key !== undefined) settings[String(row.key)] = row.value;
  }
  return { orders, timeEntries, employees, settings };
}

export function activeEmployees(employees) {
  return employees
    .filter((e) => e && e.is_active !== false)
    .map((e) => ({ id: e.id, name: String(e.name || ''), role: String(e.role || '') }));
}
```

- [ ] **Step 4: store.js**

```js
import { getPool } from '../db.js';
import { DEFAULT_METRICS, DEFAULT_LADDER } from './calc.js';

const SCHEME_COLUMNS = 'id, employee_id, kind, period_type, target_amount, metrics_json, ladder_json, is_active, created_at, updated_at';

function normalizeScheme(row) {
  return row ? { ...row, target_amount: Number(row.target_amount), employee_id: Number(row.employee_id) } : null;
}

export async function listSchemes(client = getPool()) {
  const { rows } = await client.query(`SELECT ${SCHEME_COLUMNS} FROM bonus_schemes WHERE is_active ORDER BY id`);
  return rows.map(normalizeScheme);
}

export async function getSchemeById(id, client = getPool()) {
  const { rows } = await client.query(`SELECT ${SCHEME_COLUMNS} FROM bonus_schemes WHERE id = $1`, [id]);
  return normalizeScheme(rows[0]);
}

export async function upsertScheme(employeeId, payload, client = getPool()) {
  const kind = payload.kind === 'commercial' ? 'commercial' : 'production';
  const metrics = Array.isArray(payload.metrics_json) && payload.metrics_json.length ? payload.metrics_json : DEFAULT_METRICS;
  const ladder = payload.ladder_json && typeof payload.ladder_json === 'object' ? payload.ladder_json : DEFAULT_LADDER;
  const amount = Number(payload.target_amount) || 0;
  const existing = await client.query(`SELECT id FROM bonus_schemes WHERE employee_id = $1 AND is_active`, [employeeId]);
  if (existing.rows[0]) {
    const { rows } = await client.query(
      `UPDATE bonus_schemes SET kind = $2, target_amount = $3, metrics_json = $4::jsonb, ladder_json = $5::jsonb, updated_at = now()
        WHERE id = $1 RETURNING ${SCHEME_COLUMNS}`,
      [existing.rows[0].id, kind, amount, JSON.stringify(metrics), JSON.stringify(ladder)],
    );
    return normalizeScheme(rows[0]);
  }
  const { rows } = await client.query(
    `INSERT INTO bonus_schemes (employee_id, kind, target_amount, metrics_json, ladder_json)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb) RETURNING ${SCHEME_COLUMNS}`,
    [employeeId, kind, amount, JSON.stringify(metrics), JSON.stringify(ladder)],
  );
  return normalizeScheme(rows[0]);
}

export async function getTargets(schemeId, period, client = getPool()) {
  const { rows } = await client.query(
    `SELECT metric_key, min_value, target_value, max_value FROM bonus_period_targets WHERE scheme_id = $1 AND period = $2`,
    [schemeId, period],
  );
  const targets = {};
  for (const row of rows) {
    targets[row.metric_key] = { min: Number(row.min_value), target: Number(row.target_value), max: Number(row.max_value) };
  }
  return Object.keys(targets).length ? targets : null;
}

export async function upsertTargets(schemeId, period, targets, client = getPool()) {
  for (const [key, value] of Object.entries(targets)) {
    await client.query(
      `INSERT INTO bonus_period_targets (scheme_id, period, metric_key, min_value, target_value, max_value)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (scheme_id, period, metric_key)
       DO UPDATE SET min_value = EXCLUDED.min_value, target_value = EXCLUDED.target_value, max_value = EXCLUDED.max_value, updated_at = now()`,
      [schemeId, period, key, Number(value.min), Number(value.target), Number(value.max)],
    );
  }
  return getTargets(schemeId, period, client);
}

export async function listStockApprovals(period, client = getPool()) {
  const { rows } = await client.query(`SELECT order_id FROM bonus_stock_approvals WHERE period = $1`, [period]);
  return new Set(rows.map((row) => String(row.order_id)));
}

export async function setStockApproval(period, orderId, approved, by, client = getPool()) {
  if (approved) {
    await client.query(
      `INSERT INTO bonus_stock_approvals (period, order_id, approved_by) VALUES ($1, $2, $3)
       ON CONFLICT (period, order_id) DO NOTHING`,
      [period, orderId, by],
    );
  } else {
    await client.query(`DELETE FROM bonus_stock_approvals WHERE period = $1 AND order_id = $2`, [period, orderId]);
  }
}

const RESULT_COLUMNS = 'id, scheme_id, period, status, computed_json, amount_computed, amount_final, adjustments_json, closed_at, closed_by, paid_at';

export async function getResult(schemeId, period, client = getPool()) {
  const { rows } = await client.query(`SELECT ${RESULT_COLUMNS} FROM bonus_period_results WHERE scheme_id = $1 AND period = $2`, [schemeId, period]);
  return rows[0] || null;
}

export async function listResults(schemeId, client = getPool()) {
  const { rows } = await client.query(`SELECT ${RESULT_COLUMNS} FROM bonus_period_results WHERE scheme_id = $1 ORDER BY period`, [schemeId]);
  return rows;
}

export async function saveResult(row, client = getPool()) {
  const { rows } = await client.query(
    `INSERT INTO bonus_period_results (scheme_id, period, status, computed_json, amount_computed, amount_final, adjustments_json, closed_at, closed_by, paid_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8, $9, $10)
     ON CONFLICT (scheme_id, period) DO UPDATE SET
       status = EXCLUDED.status, computed_json = EXCLUDED.computed_json, amount_computed = EXCLUDED.amount_computed,
       amount_final = EXCLUDED.amount_final, adjustments_json = EXCLUDED.adjustments_json,
       closed_at = EXCLUDED.closed_at, closed_by = EXCLUDED.closed_by, paid_at = EXCLUDED.paid_at
     RETURNING ${RESULT_COLUMNS}`,
    [row.scheme_id, row.period, row.status, JSON.stringify(row.computed_json || {}), row.amount_computed, row.amount_final,
      JSON.stringify(row.adjustments_json || []), row.closed_at || null, row.closed_by || '', row.paid_at || null],
  );
  return rows[0];
}
```

- [ ] **Step 5: routes/bonuses.js (первая часть)**

```js
import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { periodBounds, suggestProductionTargets } from '../bonuses/calc.js';
import { loadLegacyBonusData, activeEmployees } from '../bonuses/legacy.js';
import * as store from '../bonuses/store.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

function error(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function parsePeriod(res, raw) {
  try {
    return periodBounds(raw) && String(raw);
  } catch {
    error(res, 400, 'INVALID_PERIOD', 'Период задаётся как 2026-Q3');
    return null;
  }
}

async function schemeOr404(res, id) {
  const scheme = await store.getSchemeById(Number(id));
  if (!scheme) {
    error(res, 404, 'NOT_FOUND', 'Схема не найдена');
    return null;
  }
  return scheme;
}

router.get('/employees', asyncHandler(async (req, res) => {
  const { employees } = await loadLegacyBonusData(getPool());
  res.json({ data: activeEmployees(employees) });
}));

router.get('/schemes', asyncHandler(async (req, res) => {
  const [schemes, { employees }] = await Promise.all([store.listSchemes(), loadLegacyBonusData(getPool())]);
  const names = new Map(employees.map((e) => [String(e.id), String(e.name || '')]));
  res.json({ data: schemes.map((s) => ({ ...s, employee_name: names.get(String(s.employee_id)) || '' })) });
}));

router.put('/schemes/:employeeId', asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  if (!Number.isInteger(employeeId)) return error(res, 400, 'INVALID_EMPLOYEE', 'Нужен id сотрудника');
  const scheme = await store.upsertScheme(employeeId, req.body || {});
  res.json({ data: scheme });
}));

router.get('/periods/:period/suggest/:schemeId', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const scheme = await schemeOr404(res, req.params.schemeId);
  if (!scheme) return;
  const { settings } = await loadLegacyBonusData(getPool());
  res.json({ data: suggestProductionTargets({ period, settings }) });
}));

router.put('/periods/:period/targets/:schemeId', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const scheme = await schemeOr404(res, req.params.schemeId);
  if (!scheme) return;
  const targets = req.body?.targets;
  if (!targets || typeof targets !== 'object') return error(res, 400, 'INVALID_TARGETS', 'Нужен объект targets');
  for (const [key, value] of Object.entries(targets)) {
    const values = [value?.min, value?.target, value?.max].map(Number);
    if (values.some((v) => !Number.isFinite(v))) return error(res, 400, 'INVALID_TARGETS', `Пороги ${key} должны быть числами`);
  }
  res.json({ data: await store.upsertTargets(scheme.id, period, targets) });
}));

export default router;
```

В `ops/api/src/server.js` добавить импорт и монтирование рядом с `settingsRoute`:

```js
import bonusesRoute from './routes/bonuses.js';
// ...
  app.use('/api/bonuses', bonusesRoute);
```

- [ ] **Step 6: Запустить тесты**

```bash
cd ops/api && TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" node --test test/bonuses-routes.test.js
```

Ожидание: PASS.

- [ ] **Step 7: Commit**

```bash
git add ops/api/src/bonuses/store.js ops/api/src/bonuses/legacy.js ops/api/src/routes/bonuses.js ops/api/src/server.js ops/api/test/bonuses-routes.test.js
git commit -m "Add bonus schemes and period targets API"
```

---

### Task 7: Маршруты расчёта периода, складских утверждений, закрытия и года

**Files:**
- Modify: `ops/api/src/routes/bonuses.js`
- Test: `ops/api/test/bonuses-routes.test.js`

**Interfaces:**
- Consumes: `computeProductionPeriod`, `computeYear`, `store.*`, `loadLegacyBonusData`.
- Produces:
  - `GET /api/bonuses/periods/:period` → `{ data: { period, entries: [ProductionResult & { employeeName, kind, resultStatus, amountFinal, adjustments, targetsDrift }], history: [...] } }`.
  - `POST /api/bonuses/periods/:period/stock-approvals` body `{ order_id, approved }`.
  - `POST /api/bonuses/periods/:period/close/:schemeId`, `.../adjust/:schemeId` body `{ amount, comment }`, `.../paid/:schemeId`.
  - `GET /api/bonuses/years/:year` → `{ data: [{ schemeId, employeeName, quarters, year: computeYear() }] }`.
  - `POST /api/bonuses/years/:year/close/:schemeId` → результат с периодом `YYYY-Y`.

- [ ] **Step 1: Тесты**

```js
test('расчёт периода, утверждение склада, закрытие, корректировка, выплата, год', async (t) => {
  const { port, cookie } = await setup(t);
  const employeeId = Date.now();
  const base = employeeId * 10;
  await putCompatRow('employees', { id: employeeId, name: 'Лёша', role: 'production', is_active: true });
  await putCompatRow('orders', { id: base + 1, order_name: 'А', status: 'completed', production_purpose: 'commercial', total_hours_plan: 1000, deadline: '2026-09-20', completed_at: '2026-09-10T10:00:00.000Z' });
  await putCompatRow('orders', { id: base + 2, order_name: 'Склад', status: 'completed', production_purpose: 'stock_sample', total_hours_plan: 100, completed_at: '2026-09-11T10:00:00.000Z' });
  await putCompatRow('time_entries', { id: base + 1, employee_id: employeeId, date: '2026-09-01', hours: 900, order_id: base + 1 });

  const scheme = (await (await requestJson(port, 'PUT', `/api/bonuses/schemes/${employeeId}`, { kind: 'production', target_amount: 100000 }, cookie)).json()).data;
  await requestJson(port, 'PUT', `/api/bonuses/periods/2026-Q3/targets/${scheme.id}`, { targets: {
    output_hours: { min: 850, target: 1000, max: 1150 }, productivity: { min: 0.9, target: 1, max: 1.15 },
    on_time_share: { min: 0.7, target: 0.85, max: 0.95 }, rework_share: { min: 0.08, target: 0.05, max: 0.02 },
  } }, cookie);

  let res = await requestJson(port, 'GET', '/api/bonuses/periods/2026-Q3', undefined, cookie);
  assert.equal(res.status, 200);
  let entry = (await res.json()).data.entries.find((e) => e.schemeId === scheme.id);
  assert.equal(entry.employeeName, 'Лёша');
  assert.equal(entry.metrics.find((m) => m.key === 'output_hours').fact, 1000);
  assert.equal(entry.orders.find((o) => o.id === base + 2).included, false);

  await requestJson(port, 'POST', '/api/bonuses/periods/2026-Q3/stock-approvals', { order_id: base + 2, approved: true }, cookie);
  res = await requestJson(port, 'GET', '/api/bonuses/periods/2026-Q3', undefined, cookie);
  entry = (await res.json()).data.entries.find((e) => e.schemeId === scheme.id);
  assert.equal(entry.metrics.find((m) => m.key === 'output_hours').fact, 1100);

  res = await requestJson(port, 'POST', `/api/bonuses/periods/2026-Q3/close/${scheme.id}`, {}, cookie);
  assert.equal(res.status, 200);
  const closed = (await res.json()).data;
  assert.equal(closed.status, 'closed');
  assert.ok(closed.amount_computed > 0);

  // после закрытия факт не пересчитывается
  await putCompatRow('orders', { id: base + 3, order_name: 'Поздний', status: 'completed', production_purpose: 'commercial', total_hours_plan: 500, deadline: '2026-09-20', completed_at: '2026-09-12T10:00:00.000Z' });
  res = await requestJson(port, 'GET', '/api/bonuses/periods/2026-Q3', undefined, cookie);
  entry = (await res.json()).data.entries.find((e) => e.schemeId === scheme.id);
  assert.equal(entry.metrics.find((m) => m.key === 'output_hours').fact, 1100);
  assert.equal(entry.resultStatus, 'closed');

  res = await requestJson(port, 'POST', `/api/bonuses/periods/2026-Q3/adjust/${scheme.id}`, { amount: 90000 }, cookie);
  assert.equal(res.status, 400);
  res = await requestJson(port, 'POST', `/api/bonuses/periods/2026-Q3/adjust/${scheme.id}`, { amount: 90000, comment: 'Согласовано лично' }, cookie);
  const adjusted = (await res.json()).data;
  assert.equal(Number(adjusted.amount_final), 90000);
  assert.equal(adjusted.adjustments_json.length, 1);
  assert.equal(adjusted.adjustments_json[0].comment, 'Согласовано лично');

  res = await requestJson(port, 'POST', `/api/bonuses/periods/2026-Q3/paid/${scheme.id}`, {}, cookie);
  assert.equal((await res.json()).data.status, 'paid');

  res = await requestJson(port, 'GET', '/api/bonuses/years/2026', undefined, cookie);
  const yearEntry = (await res.json()).data.find((e) => e.schemeId === scheme.id);
  assert.equal(yearEntry.year.quartersCounted, 1);
  assert.equal(yearEntry.quarters.find((q) => q.period === '2026-Q3').fact, 1100);

  res = await requestJson(port, 'POST', `/api/bonuses/years/2026/close/${scheme.id}`, {}, cookie);
  assert.equal((await res.json()).data.period, '2026-Y');
});

test('закрытие без целей периода → 400', async (t) => {
  const { port, cookie } = await setup(t);
  const employeeId = Date.now();
  await putCompatRow('employees', { id: employeeId, name: 'Тест', role: 'production', is_active: true });
  const scheme = (await (await requestJson(port, 'PUT', `/api/bonuses/schemes/${employeeId}`, { kind: 'production', target_amount: 1 }, cookie)).json()).data;
  const res = await requestJson(port, 'POST', `/api/bonuses/periods/2027-Q1/close/${scheme.id}`, {}, cookie);
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

```bash
cd ops/api && TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" node --test test/bonuses-routes.test.js
```

- [ ] **Step 3: Реализация**

Добавить импорты в `routes/bonuses.js`:

```js
import { computeProductionPeriod, computeYear } from '../bonuses/calc.js';
```

И маршруты перед `export default router;`:

```js
function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

async function computeEntry(scheme, period, legacy, approvals) {
  const targets = await store.getTargets(scheme.id, period);
  const names = new Map(legacy.employees.map((e) => [String(e.id), String(e.name || '')]));
  const existing = await store.getResult(scheme.id, period);
  const suggestion = suggestProductionTargets({ period, settings: legacy.settings });
  const targetsDrift = !!(targets && targets.output_hours && Number(targets.output_hours.target) !== Number(suggestion.targets.output_hours.target));
  const common = {
    employeeName: names.get(String(scheme.employee_id)) || '',
    kind: scheme.kind,
    resultStatus: existing?.status || 'open',
    amountFinal: existing ? Number(existing.amount_final) : null,
    adjustments: existing?.adjustments_json || [],
    targetsDrift,
    hasTargets: !!targets,
  };
  if (existing && existing.status !== 'open') {
    return { ...existing.computed_json, ...common, status: existing.status };
  }
  const result = computeProductionPeriod({
    period, today: todayYmd(), status: 'open', scheme, targets, orders: legacy.orders,
    timeEntries: legacy.timeEntries, settings: legacy.settings, stockApprovals: approvals,
  });
  return { ...result, ...common };
}

router.get('/periods/:period', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const [schemes, legacy, approvals] = await Promise.all([
    store.listSchemes(), loadLegacyBonusData(getPool()), store.listStockApprovals(period),
  ]);
  const entries = [];
  const history = [];
  for (const scheme of schemes.filter((s) => s.kind === 'production')) {
    entries.push(await computeEntry(scheme, period, legacy, approvals));
    const results = await store.listResults(scheme.id);
    for (const row of results.filter((r) => r.status !== 'open')) {
      history.push({
        schemeId: scheme.id, period: row.period, status: row.status, amountComputed: Number(row.amount_computed),
        amountFinal: Number(row.amount_final), adjustments: row.adjustments_json, closedAt: row.closed_at, paidAt: row.paid_at,
      });
    }
  }
  res.json({ data: { period, entries, history } });
}));

router.post('/periods/:period/stock-approvals', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const orderId = Number(req.body?.order_id);
  if (!Number.isInteger(orderId)) return error(res, 400, 'INVALID_ORDER', 'Нужен order_id');
  await store.setStockApproval(period, orderId, req.body?.approved === true, req.user.email);
  res.json({ data: { period, order_id: orderId, approved: req.body?.approved === true } });
}));

router.post('/periods/:period/close/:schemeId', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const scheme = await schemeOr404(res, req.params.schemeId);
  if (!scheme) return;
  const targets = await store.getTargets(scheme.id, period);
  if (!targets) return error(res, 400, 'NO_TARGETS', 'Сначала сохраните цели квартала');
  const existing = await store.getResult(scheme.id, period);
  if (existing && existing.status !== 'open') return error(res, 409, 'ALREADY_CLOSED', 'Период уже закрыт');
  const [legacy, approvals] = await Promise.all([loadLegacyBonusData(getPool()), store.listStockApprovals(period)]);
  const computed = computeProductionPeriod({
    period, today: todayYmd(), status: 'closed', scheme, targets, orders: legacy.orders,
    timeEntries: legacy.timeEntries, settings: legacy.settings, stockApprovals: approvals,
  });
  const row = await store.saveResult({
    scheme_id: scheme.id, period, status: 'closed', computed_json: computed,
    amount_computed: computed.amountComputed, amount_final: computed.amountComputed,
    adjustments_json: [], closed_at: new Date().toISOString(), closed_by: req.user.email, paid_at: null,
  });
  res.json({ data: row });
}));

router.post('/periods/:period/adjust/:schemeId', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const scheme = await schemeOr404(res, req.params.schemeId);
  if (!scheme) return;
  const amount = Number(req.body?.amount);
  const comment = String(req.body?.comment || '').trim();
  if (!Number.isFinite(amount) || amount < 0) return error(res, 400, 'INVALID_AMOUNT', 'Сумма должна быть числом не меньше нуля');
  if (!comment) return error(res, 400, 'COMMENT_REQUIRED', 'Корректировка без комментария не сохраняется');
  const existing = await store.getResult(scheme.id, period);
  if (!existing || existing.status === 'open') return error(res, 400, 'NOT_CLOSED', 'Сначала закройте период');
  const adjustments = [...(existing.adjustments_json || []), {
    at: new Date().toISOString(), by: req.user.email, from: Number(existing.amount_final), to: amount, comment,
  }];
  const row = await store.saveResult({ ...existing, amount_final: amount, adjustments_json: adjustments });
  res.json({ data: row });
}));

router.post('/periods/:period/paid/:schemeId', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const scheme = await schemeOr404(res, req.params.schemeId);
  if (!scheme) return;
  const existing = await store.getResult(scheme.id, period);
  if (!existing || existing.status === 'open') return error(res, 400, 'NOT_CLOSED', 'Сначала закройте период');
  const row = await store.saveResult({ ...existing, status: 'paid', paid_at: new Date().toISOString() });
  res.json({ data: row });
}));

async function yearEntries(year) {
  const [schemes, legacy] = await Promise.all([store.listSchemes(), loadLegacyBonusData(getPool())]);
  const names = new Map(legacy.employees.map((e) => [String(e.id), String(e.name || '')]));
  const out = [];
  for (const scheme of schemes.filter((s) => s.kind === 'production')) {
    const quarters = [];
    for (const q of [1, 2, 3, 4]) {
      const period = `${year}-Q${q}`;
      const targets = await store.getTargets(scheme.id, period);
      const approvals = await store.listStockApprovals(period);
      const entry = await computeEntry(scheme, period, legacy, approvals);
      const output = (entry.metrics || []).find((m) => m.key === 'output_hours');
      const paid = entry.resultStatus !== 'open' && output ? output.payout : 0;
      quarters.push({
        period, thresholds: targets?.output_hours || null, fact: targets && output ? output.fact : null,
        paidOutputPayout: paid, resultStatus: entry.resultStatus,
      });
    }
    out.push({ schemeId: scheme.id, employeeName: names.get(String(scheme.employee_id)) || '', quarters, year: computeYear({ year, scheme, quarters }) });
  }
  return out;
}

router.get('/years/:year', asyncHandler(async (req, res) => {
  const year = Number(req.params.year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return error(res, 400, 'INVALID_YEAR', 'Нужен год');
  res.json({ data: await yearEntries(year) });
}));

router.post('/years/:year/close/:schemeId', asyncHandler(async (req, res) => {
  const year = Number(req.params.year);
  if (!Number.isInteger(year)) return error(res, 400, 'INVALID_YEAR', 'Нужен год');
  const scheme = await schemeOr404(res, req.params.schemeId);
  if (!scheme) return;
  const entry = (await yearEntries(year)).find((e) => e.schemeId === scheme.id);
  const period = `${year}-Y`;
  const existing = await store.getResult(scheme.id, period);
  if (existing && existing.status !== 'open') return error(res, 409, 'ALREADY_CLOSED', 'Год уже закрыт');
  const row = await store.saveResult({
    scheme_id: scheme.id, period, status: 'closed', computed_json: entry, amount_computed: entry.year.topUp,
    amount_final: entry.year.topUp, adjustments_json: [], closed_at: new Date().toISOString(), closed_by: req.user.email, paid_at: null,
  });
  res.json({ data: row });
}));
```

- [ ] **Step 4: Запустить тесты**

```bash
cd ops/api && TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" npm test
```

Ожидание: весь набор зелёный (в том числе compat и auth).

- [ ] **Step 5: Commit**

```bash
git add ops/api/src/routes/bonuses.js ops/api/test/bonuses-routes.test.js
git commit -m "Add bonus period computation, close, adjust and year API"
```

---

### Task 8: Страница «Бонусы» в calc

**Files:**
- Create: `js/bonuses.js`
- Modify: `js/app.js:107-178` (`isOwner`, `canAccess`), `js/app.js:1247-1280` (`onPageEnter`)
- Modify: `index.html:258` (меню), рядом с `id="page-settings"` (контейнер), `index.html:3652-3654` (скрипт)
- Test: `test/bonuses_render.test.js`, `tests/bonuses-smoke.js`

**Interfaces:**
- Consumes: `GET/PUT/POST /api/bonuses/*` (Task 6–7), `PLATFORM_API_URL` из `js/supabase.js`.
- Produces: глобальный объект `Bonuses` с `load()`; чистые функции `bonusesCurrentPeriod(date)`, `bonusesPeriodOptions(date)`, `formatRub(n)`, `formatMetricValue(metric)`, `renderMetricRow(metric)`, `renderBonusCard(entry, options)`, `renderWarnings(warnings)`, `renderHistory(history, entries)` — все возвращают строку HTML.

- [ ] **Step 1: Тесты чистых render-функций**

`test/bonuses_render.test.js`:

```js
const assert = require('node:assert');
const { test } = require('node:test');
const {
    bonusesCurrentPeriod, bonusesPeriodOptions, formatRub, formatMetricValue, renderMetricRow, renderBonusCard, renderWarnings,
} = require('../js/bonuses.js');

test('bonusesCurrentPeriod: сентябрь → Q3', () => {
    assert.equal(bonusesCurrentPeriod(new Date(2026, 8, 15)), '2026-Q3');
    assert.equal(bonusesCurrentPeriod(new Date(2026, 0, 2)), '2026-Q1');
});

test('bonusesPeriodOptions: восемь кварталов, текущий последний', () => {
    const options = bonusesPeriodOptions(new Date(2026, 8, 15));
    assert.equal(options.length, 8);
    assert.equal(options[0], '2024-Q4');
    assert.equal(options[7], '2026-Q3');
});

test('formatRub и formatMetricValue', () => {
    assert.equal(formatRub(120000), '120 000 ₽');
    assert.equal(formatMetricValue({ key: 'output_hours', fact: 1750 }), '1 750 ч');
    assert.equal(formatMetricValue({ key: 'productivity', fact: 1.0523 }), '1,05');
    assert.equal(formatMetricValue({ key: 'on_time_share', fact: 0.8889 }), '89%');
    assert.equal(formatMetricValue({ key: 'rework_share', fact: null }), '—');
});

test('renderMetricRow: риски и достижение', () => {
    const html = renderMetricRow({
        key: 'output_hours', label: 'Выпуск, нормо-часы', direction: 'higher', weight: 0.5,
        thresholds: { min: 1360, target: 1600, max: 1840 }, fact: 1700, forecast: 1810, achievement: 1.2083, payout: 60417, available: true,
    });
    assert.match(html, /bn-metric/);
    assert.match(html, /1 700 ч/);
    assert.match(html, /прогноз 1 810 ч/);
    assert.match(html, /121%/);
    assert.match(html, /60 417 ₽/);
    assert.match(html, /1 360/);
    assert.match(html, /1 840/);
});

test('renderMetricRow: недоступный показатель', () => {
    const html = renderMetricRow({ key: 'productivity', label: 'Производительность', direction: 'higher', weight: 0.25, thresholds: { min: 0.9, target: 1, max: 1.15 }, fact: null, forecast: null, achievement: null, payout: 0, available: false });
    assert.match(html, /нет данных/);
});

test('renderBonusCard: итог, статус, детали под карточкой', () => {
    const html = renderBonusCard({
        schemeId: 7, employeeName: 'Лёша', kind: 'production', resultStatus: 'open', targetAmount: 100000, amountComputed: 120000, amountFinal: null,
        metrics: [], warnings: [], orders: [{ id: 1, name: 'Заказ', purpose: 'commercial', hoursPlan: 10, hoursFact: 9, deadline: '2026-09-20', completedAt: '2026-09-10', estimated: false, onTime: true, approved: null, included: true }],
        adjustments: [], targetsDrift: false, hasTargets: true,
    }, { expanded: true });
    assert.match(html, /Лёша/);
    assert.match(html, /120 000 ₽/);
    assert.match(html, /bn-card-details/);
    assert.match(html, /Закрыть квартал/);
});

test('renderWarnings: часы без заказа', () => {
    const html = renderWarnings([{ code: 'unmarked_hours', count: 0, hours: 3, orderIds: [] }]);
    assert.match(html, /без заказа: 3 ч/);
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

```bash
node --test test/bonuses_render.test.js
```

- [ ] **Step 3: Smoke на проводку**

`tests/bonuses-smoke.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const bonuses = fs.readFileSync(path.join(root, 'js', 'bonuses.js'), 'utf8');

assert.match(html, /<a href="#bonuses" data-page="bonuses">/, 'sidebar link');
assert.match(html, /id="page-bonuses"/, 'page container');
assert.match(html, /<script src="js\/bonuses\.js\?v=\d+"><\/script>/, 'script tag');
assert.match(app, /isOwner\(\)\s*\{/, 'App.isOwner exists');
assert.match(app, /if \(page === 'bonuses'\) return this\.isOwner\(\);/, 'canAccess gates bonuses by owner');
assert.doesNotMatch(app, /ALL_PAGES: \[[^\]]*'bonuses'/, 'bonuses must not be grantable');
assert.match(app, /case 'bonuses': Bonuses\.load\(\); break;/, 'onPageEnter loads page');
assert.match(bonuses, /credentials: 'include'/, 'API calls carry session cookie');
assert.match(bonuses, /font-size:\s*1[6-9]px/, 'base font is large enough');

console.log('bonuses-smoke: OK');
```

- [ ] **Step 4: index.html**

Меню, сразу перед ссылкой `data-page="settings"`:

```html
            <a href="#bonuses" data-page="bonuses">
                <span class="nav-icon">&#9733;</span>
                <span>Бонусы</span>
            </a>
```

Контейнер страницы, перед `<div class="page" id="page-settings">` (тот же тег/класс, что у соседних страниц):

```html
        <div class="page" id="page-bonuses">
            <div class="bn-page">
                <div class="bn-toolbar">
                    <h1 class="bn-title">Бонусы</h1>
                    <div class="bn-periods" id="bonuses-periods"></div>
                </div>
                <div id="bonuses-cards" class="bn-cards"></div>
                <div id="bonuses-year" class="bn-year"></div>
                <div id="bonuses-history" class="bn-history"></div>
            </div>
        </div>
```

Скрипт после `production_load.js`:

```html
<script src="js/bonuses.js?v=1"></script>
```

- [ ] **Step 5: app.js**

После `isAdmin()`:

```js
    // Владелец: admin без привязки к сотруднику. Только он видит бонусы.
    isOwner() {
        if (!this.currentUser) return false;
        const role = this.currentUser.role === 'admin' || this.currentUser.id === '__admin';
        const empId = this.currentUser.employee_id;
        return role && (empId === null || empId === undefined || empId === '');
    },
```

В `canAccess` сразу после `if (page === 'leads') return true;`:

```js
        if (page === 'bonuses') return this.isOwner();
```

В `onPageEnter` перед `case 'settings'`:

```js
            case 'bonuses': Bonuses.load(); break;
```

- [ ] **Step 6: js/bonuses.js**

```js
// Страница «Бонусы»: только владелец. Данные и расчёт приходят из
// /api/bonuses/*; здесь только выбор периода, отрисовка и действия.

const BONUSES_API_URL = (typeof PLATFORM_API_URL !== 'undefined') ? PLATFORM_API_URL : 'https://api.recycleobject.ru';

const BONUSES_CSS = `
.bn-page{font-size:16px;line-height:1.45;max-width:1100px;padding:8px 4px 40px}
.bn-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px}
.bn-title{font-size:26px;margin:0}
.bn-periods{display:flex;gap:6px;flex-wrap:wrap}
.bn-period{border:1px solid #d0d7de;background:#fff;border-radius:999px;padding:6px 14px;font-size:15px;cursor:pointer}
.bn-period.active{background:#1f6feb;border-color:#1f6feb;color:#fff}
.bn-cards{display:flex;flex-direction:column;gap:18px}
.bn-card{border:1px solid #d0d7de;border-radius:12px;background:#fff;padding:18px 20px}
.bn-card-head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap;margin-bottom:12px}
.bn-name{font-size:22px;font-weight:600}
.bn-status{font-size:14px;color:#57606a}
.bn-total{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}
.bn-total small{font-size:14px;font-weight:400;color:#57606a;margin-left:8px}
.bn-metric{display:grid;grid-template-columns:220px 1fr 130px 90px 120px;gap:14px;align-items:center;padding:10px 0;border-top:1px solid #eaeef2}
.bn-metric-label{font-weight:600}
.bn-metric-weight{display:block;font-size:13px;color:#57606a;font-weight:400}
.bn-track{position:relative;height:14px;background:#eef1f4;border-radius:7px}
.bn-fill{position:absolute;left:0;top:0;bottom:0;background:#2da44e;border-radius:7px}
.bn-fill.below{background:#cf222e}.bn-fill.mid{background:#bf8700}
.bn-tick{position:absolute;top:-6px;width:2px;height:26px;background:#24292f}
.bn-tick-label{position:absolute;top:22px;transform:translateX(-50%);font-size:12px;color:#57606a;white-space:nowrap}
.bn-fact{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
.bn-forecast{display:block;font-size:13px;color:#57606a;font-weight:400}
.bn-ach{font-size:18px;font-variant-numeric:tabular-nums}
.bn-payout{font-size:18px;text-align:right;font-variant-numeric:tabular-nums}
.bn-muted{color:#57606a}
.bn-warnings{margin-top:12px;padding:10px 14px;background:#fff8c5;border:1px solid #d4a72c;border-radius:8px;font-size:15px}
.bn-warnings li{margin:2px 0}
.bn-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.bn-btn{border:1px solid #d0d7de;background:#f6f8fa;border-radius:8px;padding:8px 14px;font-size:15px;cursor:pointer}
.bn-btn.primary{background:#1f6feb;border-color:#1f6feb;color:#fff}
.bn-card-details{margin-top:14px;border-top:1px dashed #d0d7de;padding-top:12px}
.bn-table{width:100%;border-collapse:collapse;font-size:15px}
.bn-table th,.bn-table td{padding:6px 8px;text-align:left;border-bottom:1px solid #eaeef2;vertical-align:top}
.bn-table td.num{text-align:right;font-variant-numeric:tabular-nums}
.bn-year,.bn-history{margin-top:24px}
.bn-h2{font-size:20px;margin:0 0 10px}
.bn-dialog{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:1000}
.bn-dialog-box{background:#fff;border-radius:12px;padding:20px 22px;min-width:420px;max-width:92vw;font-size:16px}
.bn-dialog-box label{display:block;margin:8px 0 4px}
.bn-dialog-box input,.bn-dialog-box textarea{width:100%;font-size:16px;padding:6px 8px;border:1px solid #d0d7de;border-radius:6px}
.bn-targets-grid{display:grid;grid-template-columns:200px repeat(3,1fr);gap:8px;align-items:center}
@media (max-width:800px){.bn-metric{grid-template-columns:1fr 1fr;} .bn-track{grid-column:1/-1}}
`;

function bonusesCurrentPeriod(date = new Date()) {
    const q = Math.floor(date.getMonth() / 3) + 1;
    return `${date.getFullYear()}-Q${q}`;
}

function bonusesPeriodOptions(date = new Date()) {
    const options = [];
    let year = date.getFullYear();
    let q = Math.floor(date.getMonth() / 3) + 1;
    for (let i = 0; i < 8; i += 1) {
        options.unshift(`${year}-Q${q}`);
        q -= 1;
        if (q === 0) { q = 4; year -= 1; }
    }
    return options;
}

function bonusesEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function formatRub(value) {
    const n = Math.round(Number(value) || 0);
    return `${n.toLocaleString('ru-RU').replace(/ /g, ' ')} ₽`;
}

function formatHours(value) {
    return `${Math.round(Number(value) || 0).toLocaleString('ru-RU').replace(/ /g, ' ')} ч`;
}

function formatMetricValue(metric) {
    const fact = metric?.fact;
    if (fact === null || fact === undefined || !Number.isFinite(Number(fact))) return '—';
    switch (metric.key) {
        case 'output_hours': return formatHours(fact);
        case 'productivity': return Number(fact).toFixed(2).replace('.', ',');
        case 'on_time_share':
        case 'rework_share': return `${Math.round(Number(fact) * 100)}%`;
        default: return String(fact);
    }
}

function bonusesTrackPercent(value, metric) {
    const { min, target, max } = metric.thresholds || {};
    const lower = metric.direction === 'lower';
    const lo = lower ? Number(max) : Number(min);
    const hi = lower ? Number(min) : Number(max);
    const span = hi - lo || 1;
    const v = lower ? (hi - Number(value)) + lo : Number(value);
    const pct = ((v - lo) / span) * 0.8 + 0.1;
    return Math.max(0, Math.min(1, pct)) * 100;
}

function renderMetricRow(metric) {
    const thr = metric.thresholds;
    const weightPct = Math.round((Number(metric.weight) || 0) * 100);
    if (!metric.available || !thr) {
        return `<div class="bn-metric" data-metric="${bonusesEscape(metric.key)}">
            <div class="bn-metric-label">${bonusesEscape(metric.label)}<span class="bn-metric-weight">вес ${weightPct}%</span></div>
            <div class="bn-track"></div>
            <div class="bn-fact bn-muted">нет данных</div>
            <div class="bn-ach bn-muted">—</div>
            <div class="bn-payout">${formatRub(0)}</div>
        </div>`;
    }
    const factPct = bonusesTrackPercent(metric.fact, metric);
    const ach = Number(metric.achievement) || 0;
    const fillClass = ach === 0 ? 'below' : (ach < 1 ? 'mid' : '');
    const ticks = ['min', 'target', 'max'].map((key) => {
        const pct = bonusesTrackPercent(thr[key], metric);
        const label = formatMetricValue({ key: metric.key, fact: thr[key] });
        return `<div class="bn-tick" style="left:${pct.toFixed(1)}%"></div><div class="bn-tick-label" style="left:${pct.toFixed(1)}%">${bonusesEscape(label)}</div>`;
    }).join('');
    const forecast = metric.forecast !== null && metric.forecast !== undefined
        ? `<span class="bn-forecast">прогноз ${bonusesEscape(formatMetricValue({ key: metric.key, fact: metric.forecast }))}, если темп сохранится</span>`
        : '';
    return `<div class="bn-metric" data-metric="${bonusesEscape(metric.key)}">
        <div class="bn-metric-label">${bonusesEscape(metric.label)}<span class="bn-metric-weight">вес ${weightPct}%</span></div>
        <div class="bn-track"><div class="bn-fill ${fillClass}" style="width:${factPct.toFixed(1)}%"></div>${ticks}</div>
        <div class="bn-fact">${bonusesEscape(formatMetricValue(metric))}${forecast}</div>
        <div class="bn-ach">${Math.round(ach * 100)}%</div>
        <div class="bn-payout">${formatRub(metric.payout)}</div>
    </div>`;
}

const BONUSES_WARNING_TEXT = {
    no_hours: (w) => `Заказы без нормо-часов, в выпуск не вошли: ${w.count}`,
    no_deadline: (w) => `Заказы без дедлайна, не учтены в «В срок»: ${w.count}`,
    estimated_dates: (w) => `Дата завершения оценочная (по табелю или последнему изменению): ${w.count}`,
    unmarked_hours: (w) => `Часы табеля без заказа: ${bonusesEscape(String(w.hours).replace('.', ','))} ч`,
    no_timesheet: () => 'Табель по завершённым заказам пустой: производительность не считается',
};

function renderWarnings(warnings) {
    if (!Array.isArray(warnings) || !warnings.length) return '';
    const items = warnings.map((w) => {
        const text = (BONUSES_WARNING_TEXT[w.code] || (() => w.code))(w);
        const ids = Array.isArray(w.orderIds) && w.orderIds.length
            ? ' ' + w.orderIds.map((id) => `<a href="#order-detail/${bonusesEscape(id)}">#${bonusesEscape(id)}</a>`).join(', ')
            : '';
        return `<li>${text}${ids}</li>`;
    }).join('');
    return `<div class="bn-warnings"><ul>${items}</ul></div>`;
}

function bonusesStatusLabel(status) {
    return { open: 'открыт', closed: 'закрыт', paid: 'выплачен' }[status] || status;
}

function renderOrdersTable(entry) {
    const rows = (entry.orders || []).map((o) => {
        const stock = o.purpose === 'stock_sample';
        const approve = stock
            ? `<label><input type="checkbox" class="bn-approve" data-order="${bonusesEscape(o.id)}" ${o.approved ? 'checked' : ''} ${entry.resultStatus !== 'open' ? 'disabled' : ''}> в зачёт</label>`
            : (o.included ? 'да' : 'нет');
        const onTime = o.onTime === null ? '—' : (o.onTime ? 'да' : 'нет');
        return `<tr>
            <td><a href="#order-detail/${bonusesEscape(o.id)}">${bonusesEscape(o.name || `#${o.id}`)}</a>${stock ? ' <span class="bn-muted">склад</span>' : ''}</td>
            <td class="num">${formatHours(o.hoursPlan)}</td>
            <td class="num">${formatHours(o.hoursFact)}</td>
            <td>${bonusesEscape(o.deadline || '—')}</td>
            <td>${bonusesEscape(o.completedAt || '—')}${o.estimated ? ' <span class="bn-muted">оценочно</span>' : ''}</td>
            <td>${onTime}</td>
            <td>${approve}</td>
        </tr>`;
    }).join('');
    return `<table class="bn-table"><thead><tr>
        <th>Заказ</th><th>Нормо-часы</th><th>Табель</th><th>Дедлайн</th><th>Завершён</th><th>В срок</th><th>В зачёт</th>
    </tr></thead><tbody>${rows || '<tr><td colspan="7" class="bn-muted">Завершённых заказов в периоде нет</td></tr>'}</tbody></table>`;
}

function renderBonusCard(entry, options = {}) {
    const expanded = options.expanded === true;
    const open = entry.resultStatus === 'open';
    const total = entry.amountFinal !== null && entry.amountFinal !== undefined && Number(entry.amountFinal) !== Number(entry.amountComputed)
        ? `${formatRub(entry.amountFinal)}<small>расчёт ${formatRub(entry.amountComputed)}</small>`
        : formatRub(entry.amountComputed);
    const drift = entry.targetsDrift ? '<div class="bn-warnings">Сезонный план изменился после сохранения целей. Откройте «Цели квартала», чтобы пересохранить.</div>' : '';
    const noTargets = !entry.hasTargets ? '<div class="bn-warnings">Цели квартала не заданы. Нажмите «Цели квартала».</div>' : '';
    const actions = `<div class="bn-actions">
        <button class="bn-btn" data-action="toggle" data-scheme="${entry.schemeId}">${expanded ? 'Скрыть детали' : 'Детали'}</button>
        <button class="bn-btn" data-action="targets" data-scheme="${entry.schemeId}" ${open ? '' : 'disabled'}>Цели квартала</button>
        ${open ? `<button class="bn-btn primary" data-action="close" data-scheme="${entry.schemeId}" ${entry.hasTargets ? '' : 'disabled'}>Закрыть квартал</button>` : ''}
        ${entry.resultStatus === 'closed' ? `<button class="bn-btn" data-action="adjust" data-scheme="${entry.schemeId}">Корректировка</button><button class="bn-btn primary" data-action="paid" data-scheme="${entry.schemeId}">Выплачено</button>` : ''}
    </div>`;
    const adjustments = (entry.adjustments || []).map((a) => `<li>${bonusesEscape(String(a.at).slice(0, 10))}: ${formatRub(a.from)} → ${formatRub(a.to)}. ${bonusesEscape(a.comment)}</li>`).join('');
    const details = expanded ? `<div class="bn-card-details">
        ${renderOrdersTable(entry)}
        ${adjustments ? `<h3 class="bn-h2" style="margin-top:14px">Корректировки</h3><ul>${adjustments}</ul>` : ''}
    </div>` : '';
    return `<div class="bn-card" data-scheme="${entry.schemeId}">
        <div class="bn-card-head">
            <div><div class="bn-name">${bonusesEscape(entry.employeeName || `Схема #${entry.schemeId}`)}</div>
            <div class="bn-status">производство · бонус на цели ${formatRub(entry.targetAmount)} · период ${bonusesStatusLabel(entry.resultStatus)}</div></div>
            <div class="bn-total">${total}</div>
        </div>
        ${noTargets}${drift}
        ${(entry.metrics || []).map(renderMetricRow).join('')}
        ${renderWarnings(entry.warnings)}
        ${actions}
        ${details}
    </div>`;
}

function renderHistory(history, entries) {
    if (!Array.isArray(history) || !history.length) return '<h2 class="bn-h2">Журнал</h2><div class="bn-muted">Закрытых периодов пока нет</div>';
    const names = new Map((entries || []).map((e) => [e.schemeId, e.employeeName]));
    const rows = history.map((h) => `<tr>
        <td>${bonusesEscape(h.period)}</td><td>${bonusesEscape(names.get(h.schemeId) || h.schemeId)}</td>
        <td class="num">${formatRub(h.amountComputed)}</td><td class="num">${formatRub(h.amountFinal)}</td>
        <td>${bonusesStatusLabel(h.status)}</td>
        <td>${(h.adjustments || []).map((a) => bonusesEscape(a.comment)).join('; ')}</td>
    </tr>`).join('');
    return `<h2 class="bn-h2">Журнал</h2><table class="bn-table"><thead><tr>
        <th>Период</th><th>Сотрудник</th><th>Расчёт</th><th>Итог</th><th>Статус</th><th>Комментарии</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

function renderYear(yearData, year) {
    if (!Array.isArray(yearData) || !yearData.length) return '';
    const rows = yearData.map((e) => {
        const q = e.quarters.map((x) => `<td class="num">${x.fact === null ? '—' : formatHours(x.fact)}</td>`).join('');
        return `<tr><td>${bonusesEscape(e.employeeName)}</td>${q}
            <td class="num">${formatHours(e.year.factSum)} / ${formatHours(e.year.thresholdsSum.target)}</td>
            <td class="num">${e.year.achievement === null ? '—' : `${Math.round(e.year.achievement * 100)}%`}</td>
            <td class="num">${formatRub(e.year.topUp)}</td>
            <td><button class="bn-btn" data-action="close-year" data-scheme="${e.schemeId}" ${e.year.quartersCounted === 4 ? '' : 'disabled'}>Закрыть год</button></td></tr>`;
    }).join('');
    return `<h2 class="bn-h2">Год ${year}: выпуск</h2><table class="bn-table"><thead><tr>
        <th>Сотрудник</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Факт / цель</th><th>Достижение</th><th>Добор</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

const Bonuses = {
    period: null,
    data: null,
    yearData: null,
    expanded: new Set(),
    _cssInjected: false,
    _bound: false,

    async api(method, path, body) {
        const options = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
        if (body !== undefined) options.body = JSON.stringify(body);
        const res = await fetch(`${BONUSES_API_URL}/api/bonuses${path}`, options);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error?.message || `Ошибка API ${res.status}`);
        return json.data;
    },

    injectCss() {
        if (this._cssInjected || typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.textContent = BONUSES_CSS;
        document.head.appendChild(style);
        this._cssInjected = true;
    },

    async load() {
        if (typeof App !== 'undefined' && !App.isOwner()) { App.navigate('orders'); return; }
        this.injectCss();
        this.bind();
        if (!this.period) this.period = bonusesCurrentPeriod();
        this.renderPeriods();
        const cards = document.getElementById('bonuses-cards');
        cards.innerHTML = '<div class="bn-muted">Загрузка…</div>';
        try {
            const year = Number(this.period.slice(0, 4));
            [this.data, this.yearData] = await Promise.all([this.api('GET', `/periods/${this.period}`), this.api('GET', `/years/${year}`)]);
            this.render();
        } catch (e) {
            cards.innerHTML = `<div class="bn-warnings">${bonusesEscape(e.message)}</div>`;
        }
    },

    renderPeriods() {
        const box = document.getElementById('bonuses-periods');
        box.innerHTML = bonusesPeriodOptions().map((p) => `<button class="bn-period ${p === this.period ? 'active' : ''}" data-period="${p}">${p.replace('-Q', ' · Q')}</button>`).join('');
    },

    render() {
        const cards = document.getElementById('bonuses-cards');
        const entries = this.data?.entries || [];
        cards.innerHTML = entries.length
            ? entries.map((e) => renderBonusCard(e, { expanded: this.expanded.has(e.schemeId) })).join('')
            : '<div class="bn-muted">Схем пока нет. Создайте схему кнопкой ниже.</div>' +
              '<div class="bn-actions"><button class="bn-btn primary" data-action="new-scheme">Новая схема</button></div>';
        document.getElementById('bonuses-year').innerHTML = renderYear(this.yearData, Number(this.period.slice(0, 4)));
        document.getElementById('bonuses-history').innerHTML = renderHistory(this.data?.history, entries);
    },

    bind() {
        if (this._bound) return;
        this._bound = true;
        document.getElementById('page-bonuses').addEventListener('click', (event) => {
            const periodBtn = event.target.closest('[data-period]');
            if (periodBtn) { this.period = periodBtn.dataset.period; this.load(); return; }
            const btn = event.target.closest('[data-action]');
            if (btn) this.handleAction(btn.dataset.action, Number(btn.dataset.scheme));
        });
        document.getElementById('page-bonuses').addEventListener('change', (event) => {
            const cb = event.target.closest('.bn-approve');
            if (!cb) return;
            this.api('POST', `/periods/${this.period}/stock-approvals`, { order_id: Number(cb.dataset.order), approved: cb.checked })
                .then(() => this.load())
                .catch((e) => App.toast(e.message));
        });
    },

    async handleAction(action, schemeId) {
        try {
            if (action === 'toggle') {
                if (this.expanded.has(schemeId)) this.expanded.delete(schemeId); else this.expanded.add(schemeId);
                this.render();
            } else if (action === 'targets') {
                await this.openTargetsDialog(schemeId);
            } else if (action === 'close') {
                if (!confirm('Закрыть квартал? Факт зафиксируется и больше не пересчитается.')) return;
                await this.api('POST', `/periods/${this.period}/close/${schemeId}`, {});
                App.toast('Квартал закрыт');
                await this.load();
            } else if (action === 'adjust') {
                const amount = prompt('Итоговая сумма, ₽');
                if (amount === null) return;
                const comment = prompt('Комментарий (обязательно)');
                if (!comment) { App.toast('Без комментария корректировка не сохраняется'); return; }
                await this.api('POST', `/periods/${this.period}/adjust/${schemeId}`, { amount: Number(String(amount).replace(/\s/g, '')), comment });
                await this.load();
            } else if (action === 'paid') {
                await this.api('POST', `/periods/${this.period}/paid/${schemeId}`, {});
                await this.load();
            } else if (action === 'close-year') {
                if (!confirm('Закрыть год и зафиксировать добор?')) return;
                await this.api('POST', `/years/${this.period.slice(0, 4)}/close/${schemeId}`, {});
                App.toast('Год закрыт');
                await this.load();
            } else if (action === 'new-scheme') {
                await this.openSchemeDialog();
            }
        } catch (e) {
            App.toast(e.message);
        }
    },

    async openSchemeDialog() {
        const employees = await this.api('GET', '/employees');
        const options = employees.map((e) => `<option value="${e.id}">${bonusesEscape(e.name)}</option>`).join('');
        const box = this.dialog(`<h2 class="bn-h2">Новая схема</h2>
            <label>Сотрудник</label><select id="bn-scheme-employee">${options}</select>
            <label>Бонус на цели, ₽ за квартал</label><input id="bn-scheme-amount" type="number" value="100000">
            <div class="bn-actions"><button class="bn-btn primary" id="bn-scheme-save">Сохранить</button><button class="bn-btn" data-dialog-close>Отмена</button></div>`);
        box.querySelector('#bn-scheme-save').addEventListener('click', async () => {
            const employeeId = Number(box.querySelector('#bn-scheme-employee').value);
            const amount = Number(box.querySelector('#bn-scheme-amount').value);
            await this.api('PUT', `/schemes/${employeeId}`, { kind: 'production', target_amount: amount });
            box.remove();
            await this.load();
        });
    },

    async openTargetsDialog(schemeId) {
        const entry = (this.data?.entries || []).find((e) => e.schemeId === schemeId);
        const suggestion = await this.api('GET', `/periods/${this.period}/suggest/${schemeId}`);
        const current = {};
        for (const m of entry?.metrics || []) if (m.thresholds) current[m.key] = m.thresholds;
        const keys = ['output_hours', 'productivity', 'on_time_share', 'rework_share'];
        const labels = { output_hours: 'Выпуск, ч', productivity: 'Производительность', on_time_share: 'В срок (0–1)', rework_share: 'Переделки (0–1)' };
        const row = (key, values) => `<div>${labels[key]}</div>` + ['min', 'target', 'max'].map((k) => `<input type="number" step="any" data-key="${key}" data-k="${k}" value="${values?.[k] ?? ''}">`).join('');
        const box = this.dialog(`<h2 class="bn-h2">Цели ${this.period}</h2>
            <div class="bn-muted">Источник подсказки: ${suggestion.source === 'plan' ? 'сезонный план' : 'формула из настроек'}</div>
            <div class="bn-targets-grid"><div></div><div>мин</div><div>цель</div><div>макс</div>${keys.map((k) => row(k, current[k] || suggestion.targets[k])).join('')}</div>
            <div class="bn-actions"><button class="bn-btn" id="bn-targets-suggest">Взять из сезонного плана</button><button class="bn-btn primary" id="bn-targets-save">Сохранить</button><button class="bn-btn" data-dialog-close>Отмена</button></div>`);
        box.querySelector('#bn-targets-suggest').addEventListener('click', () => {
            box.querySelectorAll('input[data-key]').forEach((input) => { input.value = suggestion.targets[input.dataset.key][input.dataset.k]; });
        });
        box.querySelector('#bn-targets-save').addEventListener('click', async () => {
            const targets = {};
            box.querySelectorAll('input[data-key]').forEach((input) => {
                targets[input.dataset.key] = targets[input.dataset.key] || {};
                targets[input.dataset.key][input.dataset.k] = Number(input.value);
            });
            await this.api('PUT', `/periods/${this.period}/targets/${schemeId}`, { targets });
            box.remove();
            await this.load();
        });
    },

    dialog(innerHtml) {
        const wrap = document.createElement('div');
        wrap.className = 'bn-dialog';
        wrap.innerHTML = `<div class="bn-dialog-box">${innerHtml}</div>`;
        wrap.addEventListener('click', (event) => {
            if (event.target === wrap || event.target.closest('[data-dialog-close]')) wrap.remove();
        });
        document.body.appendChild(wrap);
        return wrap;
    },
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        bonusesCurrentPeriod, bonusesPeriodOptions, formatRub, formatHours, formatMetricValue,
        renderMetricRow, renderBonusCard, renderWarnings, renderHistory, renderYear,
    };
}
```

- [ ] **Step 7: Запустить тесты**

```bash
node --test test/bonuses_render.test.js && node tests/bonuses-smoke.js
```

Ожидание: PASS и `bonuses-smoke: OK`. Если `renderMetricRow` в тесте не находит `121%`, проверить округление `Math.round(1.2083 * 100)`.

- [ ] **Step 8: Проверить в браузере**

Локально открыть calc (как в `docs/deploy-domain.md` / просто `index.html` через локальный сервер) под владельцем: пункт «Бонусы» виден, страница грузится, «Новая схема» создаёт схему Лёши, «Цели квартала» подтягивает сезонный план, карточка показывает 4 показателя и предупреждения. Под обычным сотрудником пункта нет, `#bonuses` уводит на заказы с тостом.

- [ ] **Step 9: Commit**

```bash
git add js/bonuses.js js/app.js index.html test/bonuses_render.test.js tests/bonuses-smoke.js
git commit -m "Add owner-only bonuses page"
```

---

### Task 9: Версия, полный прогон, PR

**Files:**
- Modify: `js/version.json`, `js/app.js:5`, `index.html:10`, `index.html:190`, теги `?v=` у `js/app.js` и `js/bonuses.js`.

- [ ] **Step 1: Узнать версию main и поднять**

```bash
git fetch origin main && git show origin/main:js/version.json
```

Взять `vN`, поставить `v(N+1)` в четырёх якорях. Поднять `?v=` у `js/app.js` (на +1 к текущему) и оставить `js/bonuses.js?v=1`.

- [ ] **Step 2: Прогнать smokes**

```bash
node tests/version-smoke.js && node tests/bonuses-smoke.js && node --test test/bonuses_render.test.js test/production_load.test.js && node tests/order-flow-smoke.js
```

Ожидание: всё зелёное.

- [ ] **Step 3: Полный прогон API**

```bash
cd ops/api && TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" npm test
```

- [ ] **Step 4: Commit и PR**

```bash
git add js/version.json js/app.js index.html
git commit -m "Bump version for bonuses page"
git push -u origin codex/bonuses-production-manager
gh pr create --title "Bonuses page and production manager scheme" --body-file docs/specs/2026-09-09-bonuses-production-manager.md
```

После merge: следить за `Deploy GitHub Pages`, `Yandex static sync`, `Live site smoke`, `Yandex mirror smoke` и деплоем `ops/**` (миграция 019 применится автоматически). Затем выполнить Task 0 ещё раз на проде и создать схему Лёши через страницу.
