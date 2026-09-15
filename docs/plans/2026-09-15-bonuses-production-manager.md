# План: бонусы, ядро и схема начальника производства

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Связанный дизайн: `docs/specs/2026-09-09-bonuses-production-manager.md`.
Ветка: `codex/bonuses-production-manager`. Один PR.

**Goal:** Страница «Бонусы» в calc, видимая только владельцу, где по кварталам считается бонус начальника производства: выпуск в нормо-часах против трёх уровней плана, ставка за нормо-час по линейной шкале, множитель качества, журнал закрытых периодов.

**Architecture:** Расчёт и хранение в `ops/api` (Express, ESM): чистые функции в `ops/api/src/bonuses/calc.js`, свои таблицы через `store.js`, legacy-строки из `compat_rows` через `legacy.js`, маршруты `/api/bonuses/*` под ролью admin. Страница в calc: `js/bonuses.js` дергает API через `fetch` с cookie-сессией. API в пути записи заказа начинает проставлять `completed_at`.

**Tech Stack:** Node 20, Express, Postgres 16 (`node --test` с живой БД), vanilla JS calc без бандлера, `node:test` для чистых функций, smoke-тесты в `tests/`.

## Global Constraints

- Все маршруты `/api/bonuses/*`: `router.use(requireAuth, requireRole('admin'))`; роль `user` получает 403.
- Страница `bonuses` НЕ добавляется в `App.ALL_PAGES` и `App.DEFAULT_PAGES`; доступ только через `App.isOwner()` = `currentUser.role === 'admin' && currentUser.employee_id == null`.
- Legacy-данные только из `compat_rows` (`orders`, `time_entries`, `employees`, `settings`).
- Шкала (одна для всего): ниже `min` 0; `min` 0,5; `target` 1,0; `max` 1,5; линейно между; выше `max` 1,5. Для выпуска `min/target/max` = base / medium / aspiration.
- Сумма квартала = `output_hours × rate × A_level × quality`, где `A_level = 0,7 × A_output + 0,3 × A_cash` (без плана/факта денег `A_level = A_output`), `quality = 0,5 × A_prod + 0,3 × A_ontime + 0,2 × A_rework`. Округление до рубля.
- Факт денег квартала = «Поступления» по направлению Recycle Object в Финтабло, вводится владельцем (`bonus_team_facts`, `source = manual`).
- Пустой табель по завершённым заказам: `A_prod = 0,5` и предупреждение `no_timesheet`. Нет заказов с дедлайном: `A_ontime = 1`, предупреждение `no_deadline_orders`. Нет часов периода: `A_rework = 1`, предупреждение `no_period_hours`.
- Коммерческий заказ = `production_purpose` не `rework` и не `stock_sample`, статус не `cancelled`/`deleted`, нет `deleted_at`.
- Даты legacy: `deadline`, `date` табеля строки `YYYY-MM-DD`; `completed_at`, `updated_at` ISO; сравниваем первые 10 символов.
- Версия calc: четыре якоря + `?v=` у изменённых скриптов; перед бампом читать `origin/main`.
- Коммит после каждой задачи, без `--no-verify`.

## Структура файлов

Создать:

- `ops/db/migrations/019_bonuses.sql`
- `ops/api/src/compat-rows.js` — `readCompatRows(client, table, lock)`.
- `ops/api/src/bonuses/calc.js` — периоды, рабочие дни, шкала, расчёт квартала, год, подсказка.
- `ops/api/src/bonuses/legacy.js` — загрузка legacy-строк.
- `ops/api/src/bonuses/store.js` — SQL к `bonus_*`.
- `ops/api/src/routes/bonuses.js`
- `ops/api/test/bonuses-calc.test.js`, `ops/api/test/bonuses-routes.test.js`
- `js/bonuses.js`, `test/bonuses_render.test.js`, `tests/bonuses-smoke.js`

Изменить:

- `ops/api/src/routes/compat.js` — импорт `readCompatRows`, `stampCompletedAt`.
- `ops/api/src/server.js` — монтирование `/api/bonuses`.
- `index.html`, `js/app.js`, `js/version.json`.

---

### Task 0: Проверка доступа владельца

**Files:** нет изменений кода.

- [ ] **Step 1: Роли в API**

На VM (`ssh ops@ops-staging.recycleobject.ru` или прод-хост из `ops/README.md`):

```bash
cd /srv/ops/infra && docker compose exec postgres psql -U ops -d ops -c "SELECT id, email, role, employee_id FROM auth_users WHERE role = 'admin';"
```

Ожидание: одна строка, e-mail владельца, `employee_id` пустой. Лишним `UPDATE auth_users SET role = 'user' WHERE id = <id>;` после подтверждения владельца.

- [ ] **Step 2: Владелец в calc**

В консоли браузера под владельцем:

```js
[App.currentUser.role, App.currentUser.employee_id]
```

Ожидание: `['admin', null]` или `['admin', undefined]`. Иначе в Настройки → Учётные записи отвязать сотрудника от учётной записи владельца. Без этого `isOwner()` вернёт `false`.

---

### Task 1: Миграция и общий читатель compat_rows

**Files:**
- Create: `ops/db/migrations/019_bonuses.sql`, `ops/api/src/compat-rows.js`
- Modify: `ops/api/src/routes/compat.js:165-174`
- Test: `ops/api/test/bonuses-routes.test.js`

**Interfaces:**
- Produces: `readCompatRows(client, table, lock = false): Promise<object[]>`.
- Produces: таблицы `bonus_schemes`, `bonus_period_targets`, `bonus_stock_approvals`, `bonus_period_results`, `bonus_team_targets`, `bonus_team_facts`.

- [ ] **Step 1: Миграция**

```sql
-- 019_bonuses.sql
-- Схемы бонусов, цели периодов, утверждения складских работ, результаты.
-- Доступ только из API.

CREATE TABLE IF NOT EXISTS bonus_schemes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id     BIGINT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('production', 'commercial')),
  period_type     TEXT NOT NULL DEFAULT 'quarter' CHECK (period_type = 'quarter'),
  rates_json      JSONB NOT NULL DEFAULT '{"rate":0}'::jsonb,
  quality_json    JSONB NOT NULL DEFAULT '{"weights":{"productivity":0.5,"on_time_share":0.3,"rework_share":0.2}}'::jsonb,
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

CREATE TABLE IF NOT EXISTS bonus_team_targets (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team            TEXT NOT NULL,
  period          TEXT NOT NULL,
  metric_key      TEXT NOT NULL,
  min_value       NUMERIC NOT NULL,
  target_value    NUMERIC NOT NULL,
  max_value       NUMERIC NOT NULL,
  note            TEXT NOT NULL DEFAULT '',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team, period, metric_key)
);

CREATE TABLE IF NOT EXISTS bonus_team_facts (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team            TEXT NOT NULL,
  period          TEXT NOT NULL,
  metric_key      TEXT NOT NULL,
  value           NUMERIC NOT NULL,
  source          TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'fintablo')),
  note            TEXT NOT NULL DEFAULT '',
  updated_by      TEXT NOT NULL DEFAULT '',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team, period, metric_key)
);

INSERT INTO app_meta (id, version) VALUES (1, '019-bonuses')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();
```

- [ ] **Step 2: Применить локально**

```bash
DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" ops/db/migrate.sh
```

Ожидание: `Running 019_bonuses.sql` без ошибок.

- [ ] **Step 3: Читатель compat_rows**

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

В `ops/api/src/routes/compat.js` удалить локальную `async function readRows(...)` (строки 165–174), добавить к импортам:

```js
import { readCompatRows as readRows } from '../compat-rows.js';
```

- [ ] **Step 4: Каркас тестов маршрутов**

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

// Кладёт legacy-строку в compat_rows. source_id = String(row.id), для settings row.key.
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

- [ ] **Step 5: Запустить**

```bash
cd ops/api && TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" node --test test/bonuses-routes.test.js test/compat-routes.test.js
```

Ожидание: оба зелёные.

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

- [ ] **Step 1: Тесты**

```js
import { stampCompletedAt } from '../src/routes/compat.js';

test('stampCompletedAt ставит дату при первом переходе и не перезаписывает', () => {
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

- [ ] **Step 3: Реализация**

Рядом с `syncOrderStatusSnapshot` в `compat.js`:

```js
export function stampCompletedAt(row, previous, nowIso) {
  if (!row || String(row.status || '').trim().toLowerCase() !== 'completed') return row;
  if (row.completed_at) return row;
  row.completed_at = previous?.completed_at || nowIso;
  return row;
}
```

В `executeAtomicOrderSave` после `savedOrder.updated_at = incomingOrder.updated_at || nowIso;`:

```js
  stampCompletedAt(savedOrder, existingOrder, nowIso);
```

В `executeMutation`: ветка `update`, в цикле перед `writeRow`:

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

- [ ] **Step 4: Запустить**

```bash
cd ops/api && TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" node --test test/bonuses-routes.test.js test/compat-routes.test.js
```

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
- Produces: `periodBounds(period)` → `{ year, q, from, to }`; бросает `Error('INVALID_PERIOD')`.
- Produces: `holidaySet(settings)`, `workingDays(from, to, holidays)`, `elapsedWorkingShare(period, todayYmd, holidays)`.
- Produces: `achievement(fact, thresholds, direction, ladder)` → число или `null`.
- Produces: `DEFAULT_LADDER`, `DEFAULT_QUALITY_WEIGHTS`, `DEFAULT_QUALITY_THRESHOLDS`, `METRIC_LABELS`.

- [ ] **Step 1: Тесты**

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

test('holidaySet и workingDays', () => {
  const holidays = holidaySet({ production_holidays: '2026-09-07, 2026-09-08;2026-13-99' });
  assert.equal(holidays.size, 2);
  assert.equal(workingDays('2026-09-07', '2026-09-11', holidays), 3);
  assert.equal(workingDays('2026-09-12', '2026-09-13', holidays), 0);
});

test('elapsedWorkingShare', () => {
  const none = new Set();
  assert.equal(elapsedWorkingShare('2026-Q3', '2026-06-30', none), 0);
  assert.equal(elapsedWorkingShare('2026-Q3', '2026-10-05', none), 1);
  const share = elapsedWorkingShare('2026-Q3', '2026-09-09', none);
  assert.equal(share, workingDays('2026-07-01', '2026-09-09', none) / workingDays('2026-07-01', '2026-09-30', none));
});

test('achievement: больше лучше, линейно между уровнями', () => {
  const thr = { min: 1330, target: 1512, max: 1693 };
  assert.equal(achievement(1000, thr, 'higher', DEFAULT_LADDER), 0);
  assert.equal(achievement(1330, thr, 'higher', DEFAULT_LADDER), 0.5);
  assert.equal(achievement(1512, thr, 'higher', DEFAULT_LADDER), 1);
  assert.ok(Math.abs(achievement(1550, thr, 'higher', DEFAULT_LADDER) - 1.105) < 0.001);
  assert.equal(achievement(1693, thr, 'higher', DEFAULT_LADDER), 1.5);
  assert.equal(achievement(5000, thr, 'higher', DEFAULT_LADDER), 1.5);
  assert.equal(achievement(null, thr, 'higher', DEFAULT_LADDER), null);
});

test('achievement: меньше лучше', () => {
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

- [ ] **Step 3: Реализация**

`ops/api/src/bonuses/calc.js`:

```js
// Чистые функции расчёта бонусов. Без БД и без Express.

export const DEFAULT_LADDER = { below_min: 0, min: 0.5, target: 1, max: 1.5 };

export const DEFAULT_QUALITY_WEIGHTS = { productivity: 0.5, on_time_share: 0.3, rework_share: 0.2 };

export const DEFAULT_QUALITY_THRESHOLDS = {
  productivity: { min: 0.9, target: 1.0, max: 1.15 },
  on_time_share: { min: 0.7, target: 0.85, max: 0.95 },
  rework_share: { min: 0.08, target: 0.05, max: 0.02 },
};

export const QUALITY_DIRECTIONS = { productivity: 'higher', on_time_share: 'higher', rework_share: 'lower' };

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

- [ ] **Step 4: Запустить**

```bash
cd ops/api && node --test test/bonuses-calc.test.js
```

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
- Produces: `orderCompletionDate(order, entriesForOrder)` → `{ date, estimated }`.
- Produces: `orderPurpose(order)`, `isCommercialOrder(order)`.
- Produces: `computeProductionPeriod(input)`, `input = { period, today, status, scheme, targets, orders, timeEntries, settings, stockApprovals }` → `ProductionResult`:

```js
{
  period, schemeId, employeeId, status, rate,
  output: { fact, thresholds, achievement, rateApplied, forecast, forecastAchievement, forecastAmount },
  quality: { multiplier, metrics: [{ key, label, direction, weight, thresholds, fact, achievement, available }] },
  amountComputed,
  warnings: [{ code, count, hours, orderIds }],
  orders: [{ id, name, purpose, hoursPlan, hoursFact, deadline, completedAt, estimated, onTime, approved, included }],
}
```
- Produces: `suggestProductionTargets({ period, settings })` → `{ source: 'plan' | 'formula', targets: { output_hours, productivity, on_time_share, rework_share } }`.

- [ ] **Step 1: Тесты**

```js
import { computeProductionPeriod, suggestProductionTargets, orderCompletionDate } from '../src/bonuses/calc.js';

const scheme = {
  id: 7, employee_id: 5,
  rates_json: { rate: 75 },
  quality_json: { weights: { productivity: 0.5, on_time_share: 0.3, rework_share: 0.2 } },
  ladder_json: { below_min: 0, min: 0.5, target: 1, max: 1.5 },
};
const targets = {
  output_hours: { min: 1330, target: 1512, max: 1693 },
  productivity: { min: 0.9, target: 1.0, max: 1.15 },
  on_time_share: { min: 0.7, target: 0.85, max: 0.95 },
  rework_share: { min: 0.08, target: 0.05, max: 0.02 },
};

// Факты примера спеки: выпуск 1550, производительность 1.05, в срок 0.9, переделки 0.04
function specFixture() {
  const orders = [
    ...Array.from({ length: 10 }, (_, i) => ({
      id: i + 1, order_name: `З${i}`, status: 'completed', production_purpose: 'commercial',
      total_hours_plan: 155, deadline: '2026-09-20',
      completed_at: i === 9 ? '2026-09-25T00:00:00.000Z' : '2026-09-10T00:00:00.000Z',
    })),
    { id: 99, order_name: 'Переделка', status: 'in_production', production_purpose: 'rework', total_hours_plan: 1 },
  ];
  const commercialHours = 1550 / 1.05;
  const reworkHours = (0.04 / 0.96) * commercialHours;
  const timeEntries = [
    { id: 1, employee_id: 5, date: '2026-08-01', hours: commercialHours, order_id: 1 },
    { id: 2, employee_id: 5, date: '2026-08-02', hours: reworkHours, order_id: 99 },
  ];
  return { orders, timeEntries };
}

test('computeProductionPeriod: проверочный пример спеки даёт 153 073 ₽', () => {
  const { orders, timeEntries } = specFixture();
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme, targets, orders, timeEntries,
    settings: {}, stockApprovals: new Set(),
  });
  assert.equal(result.output.fact, 1550);
  assert.ok(Math.abs(result.output.achievement - 1.105) < 0.001);
  assert.ok(Math.abs(result.output.rateApplied - 82.87) < 0.01);
  assert.ok(Math.abs(result.quality.multiplier - 1.1917) < 0.001);
  assert.ok(Math.abs(result.amountComputed - 153073) <= 2);
});

test('computeProductionPeriod: склад, предупреждения, границы периода', () => {
  const orders = [
    { id: 1, order_name: 'А', status: 'completed', production_purpose: 'commercial', total_hours_plan: 1000, deadline: '2026-09-20', completed_at: '2026-09-10T10:00:00.000Z' },
    { id: 2, order_name: 'Образцы', status: 'completed', production_purpose: 'stock_sample', total_hours_plan: 40, completed_at: '2026-08-01T10:00:00.000Z' },
    { id: 3, order_name: 'Сток', status: 'completed', production_purpose: 'stock_sample', total_hours_plan: 50, completed_at: '2026-08-02T10:00:00.000Z' },
    { id: 4, order_name: 'Старый', status: 'completed', production_purpose: 'commercial', total_hours_plan: 500, deadline: '2026-06-01', completed_at: '2026-06-20T10:00:00.000Z' },
    { id: 5, order_name: 'Без часов', status: 'completed', production_purpose: 'commercial', total_hours_plan: 0, deadline: '2026-09-01', completed_at: '2026-09-02T10:00:00.000Z' },
    { id: 6, order_name: 'Без дедлайна', status: 'completed', production_purpose: 'commercial', total_hours_plan: 10, completed_at: '2026-09-03T10:00:00.000Z' },
    { id: 7, order_name: 'Отменён', status: 'cancelled', production_purpose: 'commercial', total_hours_plan: 100, completed_at: '2026-09-03T10:00:00.000Z' },
  ];
  const timeEntries = [
    { id: 1, employee_id: 5, date: '2026-08-05', hours: 900, order_id: 1 },
    { id: 2, employee_id: 6, date: '2026-08-08', hours: 3, order_id: null },
  ];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme, targets, orders, timeEntries,
    settings: {}, stockApprovals: new Set(['2']),
  });
  assert.equal(result.output.fact, 1050); // 1000 + 40 утверждённый склад + 10 без дедлайна
  assert.equal(result.orders.find((o) => o.id === 3).included, false);
  assert.equal(result.orders.find((o) => o.id === 4), undefined);
  assert.equal(result.orders.find((o) => o.id === 7), undefined);
  assert.equal(result.warnings.find((w) => w.code === 'unmarked_hours').hours, 3);
  assert.deepEqual(result.warnings.find((w) => w.code === 'no_hours').orderIds, [5]);
  assert.deepEqual(result.warnings.find((w) => w.code === 'no_deadline').orderIds, [6]);
  const onTime = result.quality.metrics.find((m) => m.key === 'on_time_share');
  assert.equal(onTime.fact, 1);
});

test('computeProductionPeriod: пустой табель → A_prod 0.5 и предупреждение', () => {
  const orders = [{ id: 1, status: 'completed', production_purpose: 'commercial', total_hours_plan: 1512, deadline: '2026-09-20', completed_at: '2026-09-10T00:00:00.000Z' }];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme, targets, orders, timeEntries: [], settings: {}, stockApprovals: new Set(),
  });
  const prod = result.quality.metrics.find((m) => m.key === 'productivity');
  assert.equal(prod.available, false);
  assert.equal(prod.achievement, 0.5);
  assert.ok(result.warnings.some((w) => w.code === 'no_timesheet'));
  assert.ok(result.warnings.some((w) => w.code === 'no_period_hours'));
  // A_out = 1, rate 75, quality = 0.5*0.5 + 0.3*1.5 + 0.2*1 = 0.9
  assert.equal(result.amountComputed, Math.round(1512 * 75 * 0.9));
});

test('computeProductionPeriod: ниже base → 0', () => {
  const orders = [{ id: 1, status: 'completed', production_purpose: 'commercial', total_hours_plan: 1000, deadline: '2026-09-20', completed_at: '2026-09-10T00:00:00.000Z' }];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme, targets, orders, timeEntries: [{ id: 1, employee_id: 5, date: '2026-08-01', hours: 1000, order_id: 1 }], settings: {}, stockApprovals: new Set(),
  });
  assert.equal(result.output.achievement, 0);
  assert.equal(result.output.rateApplied, 0);
  assert.equal(result.amountComputed, 0);
});

test('computeProductionPeriod: прогноз по доле рабочих дней', () => {
  const orders = [{ id: 1, status: 'completed', production_purpose: 'commercial', total_hours_plan: 800, deadline: '2026-09-20', completed_at: '2026-08-10T00:00:00.000Z' }];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-08-14', status: 'open', scheme, targets, orders, timeEntries: [{ id: 1, employee_id: 5, date: '2026-08-01', hours: 800, order_id: 1 }], settings: {}, stockApprovals: new Set(),
  });
  const share = 32 / 66;
  assert.ok(Math.abs(result.output.forecast - 800 / share) < 1);
  assert.ok(result.output.forecastAmount > 0);
});

test('orderCompletionDate', () => {
  assert.deepEqual(orderCompletionDate({ completed_at: '2026-09-10T10:00:00.000Z' }, []), { date: '2026-09-10', estimated: false });
  assert.deepEqual(orderCompletionDate({ updated_at: '2026-09-30T10:00:00.000Z' }, [{ date: '2026-09-01' }, { date: '2026-09-12' }]), { date: '2026-09-12', estimated: true });
  assert.deepEqual(orderCompletionDate({ updated_at: '2026-09-30T10:00:00.000Z' }, []), { date: '2026-09-30', estimated: true });
  assert.deepEqual(orderCompletionDate({}, []), { date: null, estimated: true });
});

test('suggestProductionTargets: три уровня из сезонного плана, иначе формула', () => {
  const fromPlan = suggestProductionTargets({ period: '2026-Q3', settings: { seasonal_load_plan_json: JSON.stringify({ Q1: 864, Q2: 1296, Q3: 1512, Q4: 1728 }) } });
  assert.equal(fromPlan.source, 'plan');
  assert.deepEqual(fromPlan.targets.output_hours, { min: 1331, target: 1512, max: 1693 });
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

- [ ] **Step 3: Реализация**

Дописать в `calc.js`:

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

function roundTo(value, digits) {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
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

export function computeProductionPeriod(input) {
  const { period, today, status = 'open', scheme, targets, orders, timeEntries, settings, stockApprovals } = input;
  const { from, to } = periodBounds(period);
  const holidays = holidaySet(settings);
  const ladder = scheme.ladder_json || DEFAULT_LADDER;
  const rate = num(scheme.rates_json?.rate);
  const weights = { ...DEFAULT_QUALITY_WEIGHTS, ...(scheme.quality_json?.weights || {}) };
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
    const included = hoursPlan > 0 && (!isStock || approved);

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

  // Выпуск и уровень
  const outputThresholds = targets?.output_hours || null;
  const outputFact = roundTo(outputHours, 2);
  const outputAch = outputThresholds ? achievement(outputFact, outputThresholds, 'higher', ladder) : null;
  const rateApplied = outputAch === null ? 0 : roundTo(rate * outputAch, 2);

  // Качество
  const qualityFacts = {};
  if (outputHours > 0 && timesheetOnIncluded === 0) {
    qualityFacts.productivity = { fact: null, available: false, fallback: Number(ladder.min) };
    warnings.push({ code: 'no_timesheet', count: 0, hours: 0, orderIds: [] });
  } else if (timesheetOnIncluded > 0) {
    qualityFacts.productivity = { fact: roundTo(outputHours / timesheetOnIncluded, 4), available: true };
  } else {
    qualityFacts.productivity = { fact: null, available: false, fallback: Number(ladder.min) };
  }
  if (deadlineCount > 0) {
    qualityFacts.on_time_share = { fact: roundTo(onTimeCount / deadlineCount, 4), available: true };
  } else {
    qualityFacts.on_time_share = { fact: null, available: false, fallback: Number(ladder.target) };
    warnings.push({ code: 'no_deadline_orders', count: 0, hours: 0, orderIds: [] });
  }
  if (reworkHours + commercialPeriodHours > 0) {
    qualityFacts.rework_share = { fact: roundTo(reworkHours / (reworkHours + commercialPeriodHours), 4), available: true };
  } else {
    qualityFacts.rework_share = { fact: null, available: false, fallback: Number(ladder.target) };
    warnings.push({ code: 'no_period_hours', count: 0, hours: 0, orderIds: [] });
  }

  let multiplier = 0;
  const qualityMetrics = ['productivity', 'on_time_share', 'rework_share'].map((key) => {
    const thresholds = targets?.[key] || DEFAULT_QUALITY_THRESHOLDS[key];
    const { fact, available, fallback } = qualityFacts[key];
    const ach = available ? achievement(fact, thresholds, QUALITY_DIRECTIONS[key], ladder) : fallback;
    const weight = num(weights[key]);
    multiplier += weight * ach;
    return { key, label: METRIC_LABELS[key], direction: QUALITY_DIRECTIONS[key], weight, thresholds, fact, achievement: roundTo(ach, 4), available };
  });
  multiplier = roundTo(multiplier, 4);

  const amount = Math.round(outputFact * rateApplied * multiplier);

  // Прогноз
  const share = status === 'open' ? elapsedWorkingShare(period, today, holidays) : 1;
  let forecast = null;
  let forecastAchievement = null;
  let forecastAmount = null;
  if (status === 'open' && share > 0 && share < 1 && outputThresholds) {
    forecast = roundTo(outputFact / share, 0);
    forecastAchievement = roundTo(achievement(forecast, outputThresholds, 'higher', ladder), 4);
    forecastAmount = Math.round(forecast * rate * forecastAchievement * multiplier);
  }

  return {
    period, schemeId: scheme.id, employeeId: scheme.employee_id, status, rate,
    output: {
      fact: outputFact, thresholds: outputThresholds,
      achievement: outputAch === null ? null : roundTo(outputAch, 4), rateApplied,
      forecast, forecastAchievement, forecastAmount,
    },
    quality: { multiplier, metrics: qualityMetrics },
    amountComputed: amount, warnings, orders: detail,
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
      output_hours: { min: Math.round(target * 0.88), target, max: Math.round(target * 1.12) },
      ...DEFAULT_QUALITY_THRESHOLDS,
    },
  };
}
```

- [ ] **Step 4: Запустить**

```bash
cd ops/api && node --test test/bonuses-calc.test.js
```

Ожидание: PASS. Если сумма примера отличается больше чем на 2 ₽, проверить порядок округлений: `rateApplied` до сотых, `multiplier` до четырёх знаков, итог до рубля.

- [ ] **Step 5: Commit**

```bash
git add ops/api/src/bonuses/calc.js ops/api/test/bonuses-calc.test.js
git commit -m "Compute production bonus period with rate ladder and quality multiplier"
```

---

### Task 5: Годовой добор

**Files:**
- Modify: `ops/api/src/bonuses/calc.js`
- Test: `ops/api/test/bonuses-calc.test.js`

**Interfaces:**
- Produces: `computeYear({ year, scheme, quarters })`, `quarters = [{ period, thresholds | null, fact | null, achievement | null }]` → `{ year, factSum, thresholdsSum, achievement, quartersCounted, quarters: [{ period, fact, achievement, quarterBasis, yearBasis, topUp }], topUp }`.

- [ ] **Step 1: Тесты**

```js
import { computeYear } from '../src/bonuses/calc.js';

test('computeYear: слабый квартал доплачивается до годового уровня', () => {
  const result = computeYear({
    year: 2026, scheme,
    quarters: [
      { period: '2026-Q1', thresholds: { min: 760, target: 864, max: 968 }, fact: 600, achievement: 0 },
      { period: '2026-Q2', thresholds: { min: 1140, target: 1296, max: 1452 }, fact: 1300, achievement: 1.0128 },
      { period: '2026-Q3', thresholds: { min: 1330, target: 1512, max: 1693 }, fact: 1550, achievement: 1.105 },
      { period: '2026-Q4', thresholds: { min: 1520, target: 1728, max: 1935 }, fact: 1800, achievement: 1.1739 },
    ],
  });
  assert.equal(result.factSum, 5250);
  assert.deepEqual(result.thresholdsSum, { min: 4750, target: 5400, max: 6048 });
  assert.ok(Math.abs(result.achievement - 0.8846) < 0.001);
  assert.equal(result.quartersCounted, 4);
  assert.equal(result.quarters[0].topUp, 39808);
  assert.equal(result.quarters[1].topUp, 0);
  assert.equal(result.topUp, 39808);
});

test('computeYear: кварталы без целей не считаются', () => {
  const result = computeYear({
    year: 2026, scheme,
    quarters: [
      { period: '2026-Q3', thresholds: { min: 1330, target: 1512, max: 1693 }, fact: 1693, achievement: 1.5 },
      { period: '2026-Q4', thresholds: null, fact: null, achievement: null },
    ],
  });
  assert.equal(result.quartersCounted, 1);
  assert.equal(result.achievement, 1.5);
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
  const ladder = scheme.ladder_json || DEFAULT_LADDER;
  const rate = num(scheme.rates_json?.rate);
  const counted = quarters.filter((q) => q.thresholds && q.fact !== null && q.fact !== undefined);
  const sum = (key) => counted.reduce((acc, q) => acc + num(q.thresholds[key]), 0);
  const thresholdsSum = { min: sum('min'), target: sum('target'), max: sum('max') };
  const factSum = roundTo(counted.reduce((acc, q) => acc + num(q.fact), 0), 2);
  const yearAch = counted.length ? achievement(factSum, thresholdsSum, 'higher', ladder) : null;
  const rows = quarters.map((q) => {
    const isCounted = counted.includes(q);
    const quarterBasis = isCounted ? Math.round(num(q.fact) * rate * num(q.achievement)) : 0;
    const yearBasis = isCounted && yearAch !== null ? Math.round(num(q.fact) * rate * yearAch) : 0;
    return { period: q.period, fact: isCounted ? num(q.fact) : null, achievement: isCounted ? num(q.achievement) : null, quarterBasis, yearBasis, topUp: Math.max(0, yearBasis - quarterBasis) };
  });
  return {
    year, factSum, thresholdsSum, achievement: yearAch === null ? null : roundTo(yearAch, 4),
    quartersCounted: counted.length, quarters: rows, topUp: rows.reduce((acc, r) => acc + r.topUp, 0),
  };
}
```

- [ ] **Step 4: Запустить**

```bash
cd ops/api && node --test test/bonuses-calc.test.js
```

- [ ] **Step 5: Commit**

```bash
git add ops/api/src/bonuses/calc.js ops/api/test/bonuses-calc.test.js
git commit -m "Add annual top-up to the year level"
```

---

### Task 5b: Деньги квартала в уровне производства

**Files:**
- Modify: `ops/api/src/bonuses/calc.js` (`computeProductionPeriod`)
- Test: `ops/api/test/bonuses-calc.test.js`

**Interfaces:**
- Consumes: `achievement`, `computeProductionPeriod` из Task 4.
- Produces: `DEFAULT_LEVEL_WEIGHTS = { output: 0.7, money: 0.3 }`; вход `computeProductionPeriod` принимает `teamMoney: { fact, thresholds } | null`; результат получает `money: { fact, thresholds, achievement }`, `level` (число или `null`), `output.forecastLevel`; `output.rateApplied = rate × level`.

- [ ] **Step 1: Тесты**

```js
import { DEFAULT_LEVEL_WEIGHTS } from '../src/bonuses/calc.js';

test('уровень квартала = 0.7 × часы + 0.3 × деньги; пример спеки даёт 133 474 ₽', () => {
  const { orders, timeEntries } = specFixture();
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme, targets, orders, timeEntries,
    settings: {}, stockApprovals: new Set(),
    teamMoney: { fact: 14400000, thresholds: { min: 14000000, target: 15500000, max: 17000000 } },
  });
  assert.deepEqual(DEFAULT_LEVEL_WEIGHTS, { output: 0.7, money: 0.3 });
  assert.ok(Math.abs(result.money.achievement - 0.6333) < 0.001);
  assert.ok(Math.abs(result.level - 0.9635) < 0.001);
  assert.ok(Math.abs(result.output.rateApplied - 72.26) < 0.01);
  assert.ok(Math.abs(result.amountComputed - 133474) <= 2);
  assert.ok(!result.warnings.some((w) => w.code === 'no_money_plan'));
});

test('без плана по деньгам уровень = A_output и предупреждение', () => {
  const { orders, timeEntries } = specFixture();
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme, targets, orders, timeEntries,
    settings: {}, stockApprovals: new Set(), teamMoney: null,
  });
  assert.equal(result.money.fact, null);
  assert.ok(Math.abs(result.level - 1.105) < 0.001);
  assert.ok(result.warnings.some((w) => w.code === 'no_money_plan'));
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

```bash
cd ops/api && node --test test/bonuses-calc.test.js
```

- [ ] **Step 3: Реализация**

В `calc.js` добавить константу:

```js
export const DEFAULT_LEVEL_WEIGHTS = { output: 0.7, money: 0.3 };
```

В `computeProductionPeriod` деструктурировать `teamMoney = null` из `input` и заменить блок

```js
  const outputAch = outputThresholds ? achievement(outputFact, outputThresholds, 'higher', ladder) : null;
  const rateApplied = outputAch === null ? 0 : roundTo(rate * outputAch, 2);
```

на

```js
  const outputAch = outputThresholds ? achievement(outputFact, outputThresholds, 'higher', ladder) : null;
  const moneyThresholds = teamMoney?.thresholds || null;
  const moneyFact = teamMoney?.fact === null || teamMoney?.fact === undefined ? null : num(teamMoney.fact);
  const moneyAch = moneyThresholds && moneyFact !== null ? achievement(moneyFact, moneyThresholds, 'higher', ladder) : null;
  const levelWeights = { ...DEFAULT_LEVEL_WEIGHTS, ...(scheme.quality_json?.level_weights || {}) };
  let level = outputAch;
  if (outputAch !== null && moneyAch !== null) {
    level = roundTo(num(levelWeights.output) * outputAch + num(levelWeights.money) * moneyAch, 4);
  } else if (outputAch !== null) {
    warnings.push({ code: 'no_money_plan', count: 0, hours: 0, orderIds: [] });
  }
  const rateApplied = level === null ? 0 : roundTo(rate * level, 2);
```

Блок прогноза заменить на:

```js
  let forecast = null;
  let forecastAchievement = null;
  let forecastLevel = null;
  let forecastAmount = null;
  if (status === 'open' && share > 0 && share < 1 && outputThresholds) {
    forecast = roundTo(outputFact / share, 0);
    forecastAchievement = roundTo(achievement(forecast, outputThresholds, 'higher', ladder), 4);
    forecastLevel = moneyAch === null
      ? forecastAchievement
      : roundTo(num(levelWeights.output) * forecastAchievement + num(levelWeights.money) * moneyAch, 4);
    forecastAmount = Math.round(forecast * rate * forecastLevel * multiplier);
  }
```

В возвращаемом объекте добавить `level` и `money`, а в `output` поле `forecastLevel`:

```js
    level: level === null ? null : roundTo(level, 4),
    money: { fact: moneyFact, thresholds: moneyThresholds, achievement: moneyAch === null ? null : roundTo(moneyAch, 4) },
```

- [ ] **Step 4: Запустить**

```bash
cd ops/api && node --test test/bonuses-calc.test.js
```

Ожидание: PASS, включая старые тесты (без `teamMoney` уровень равен `A_output`, суммы прежние).

- [ ] **Step 5: Commit**

```bash
git add ops/api/src/bonuses/calc.js ops/api/test/bonuses-calc.test.js
git commit -m "Blend team money plan into production bonus level"
```

---

### Task 6: Хранилище, загрузка legacy-данных, маршруты схем и целей

**Files:**
- Create: `ops/api/src/bonuses/store.js`, `ops/api/src/bonuses/legacy.js`, `ops/api/src/routes/bonuses.js`
- Modify: `ops/api/src/server.js:29-70`
- Test: `ops/api/test/bonuses-routes.test.js`

**Interfaces:**
- Produces (`store.js`): `listSchemes()`, `getSchemeById(id)`, `upsertScheme(employeeId, payload)`, `getTargets(schemeId, period)` → `{ [metric_key]: {min,target,max} } | null`, `upsertTargets(schemeId, period, targets)`, `listStockApprovals(period)` → `Set<string>`, `setStockApproval(period, orderId, approved, by)`, `getResult(schemeId, period)`, `listResults(schemeId)`, `saveResult(row)`.
- Produces (`legacy.js`): `loadLegacyBonusData(client)` → `{ orders, timeEntries, employees, settings }`; `activeEmployees(employees)`.
- Produces: `GET /api/bonuses/employees`, `GET /api/bonuses/schemes`, `PUT /api/bonuses/schemes/:employeeId` (body `{ kind, rate }`), `GET /api/bonuses/periods/:period/suggest/:schemeId`, `PUT /api/bonuses/periods/:period/targets/:schemeId`.

- [ ] **Step 1: Тесты**

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
  await putCompatRow('settings', { key: 'seasonal_load_plan_json', value: JSON.stringify({ Q1: 864, Q2: 1296, Q3: 1512, Q4: 1728 }) });

  const put = await requestJson(port, 'PUT', `/api/bonuses/schemes/${employeeId}`, { kind: 'production', rate: 75 }, cookie);
  assert.equal(put.status, 200);
  const scheme = (await put.json()).data;
  assert.equal(scheme.kind, 'production');
  assert.equal(scheme.rates_json.rate, 75);

  const list = await requestJson(port, 'GET', '/api/bonuses/schemes', undefined, cookie);
  const schemes = (await list.json()).data;
  assert.ok(schemes.some((s) => s.id === scheme.id && s.employee_name === 'Лёша'));

  const suggest = await requestJson(port, 'GET', `/api/bonuses/periods/2026-Q3/suggest/${scheme.id}`, undefined, cookie);
  const suggestion = (await suggest.json()).data;
  assert.equal(suggestion.source, 'plan');
  assert.deepEqual(suggestion.targets.output_hours, { min: 1331, target: 1512, max: 1693 });

  const save = await requestJson(port, 'PUT', `/api/bonuses/periods/2026-Q3/targets/${scheme.id}`, { targets: suggestion.targets }, cookie);
  assert.equal(save.status, 200);
  assert.equal((await save.json()).data.output_hours.target, 1512);

  const bad = await requestJson(port, 'PUT', `/api/bonuses/periods/2026-Q9/targets/${scheme.id}`, { targets: suggestion.targets }, cookie);
  assert.equal(bad.status, 400);
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

```bash
cd ops/api && TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" node --test test/bonuses-routes.test.js
```

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
import { DEFAULT_LADDER, DEFAULT_QUALITY_WEIGHTS } from './calc.js';

const SCHEME_COLUMNS = 'id, employee_id, kind, period_type, rates_json, quality_json, ladder_json, is_active, created_at, updated_at';

function normalizeScheme(row) {
  return row ? { ...row, employee_id: Number(row.employee_id) } : null;
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
  const rates = { rate: Number(payload.rate) || 0 };
  const quality = { weights: { ...DEFAULT_QUALITY_WEIGHTS, ...(payload.quality_weights || {}) } };
  const ladder = payload.ladder_json && typeof payload.ladder_json === 'object' ? payload.ladder_json : DEFAULT_LADDER;
  const existing = await client.query(`SELECT id FROM bonus_schemes WHERE employee_id = $1 AND is_active`, [employeeId]);
  if (existing.rows[0]) {
    const { rows } = await client.query(
      `UPDATE bonus_schemes SET kind = $2, rates_json = $3::jsonb, quality_json = $4::jsonb, ladder_json = $5::jsonb, updated_at = now()
        WHERE id = $1 RETURNING ${SCHEME_COLUMNS}`,
      [existing.rows[0].id, kind, JSON.stringify(rates), JSON.stringify(quality), JSON.stringify(ladder)],
    );
    return normalizeScheme(rows[0]);
  }
  const { rows } = await client.query(
    `INSERT INTO bonus_schemes (employee_id, kind, rates_json, quality_json, ladder_json)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb) RETURNING ${SCHEME_COLUMNS}`,
    [employeeId, kind, JSON.stringify(rates), JSON.stringify(quality), JSON.stringify(ladder)],
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
    periodBounds(raw);
    return String(raw);
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
  const rate = Number(req.body?.rate);
  if (!Number.isFinite(rate) || rate < 0) return error(res, 400, 'INVALID_RATE', 'Ставка должна быть числом не меньше нуля');
  const scheme = await store.upsertScheme(employeeId, { ...req.body, rate });
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
  if (!targets || typeof targets !== 'object' || !targets.output_hours) return error(res, 400, 'INVALID_TARGETS', 'Нужен объект targets с output_hours');
  for (const [key, value] of Object.entries(targets)) {
    const values = [value?.min, value?.target, value?.max].map(Number);
    if (values.some((v) => !Number.isFinite(v))) return error(res, 400, 'INVALID_TARGETS', `Пороги ${key} должны быть числами`);
  }
  res.json({ data: await store.upsertTargets(scheme.id, period, targets) });
}));

export default router;
```

В `server.js` рядом с `settingsRoute`:

```js
import bonusesRoute from './routes/bonuses.js';
// ...
  app.use('/api/bonuses', bonusesRoute);
```

- [ ] **Step 6: Запустить**

```bash
cd ops/api && TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" node --test test/bonuses-routes.test.js
```

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
- Produces: `GET /api/bonuses/periods/:period` → `{ data: { period, entries: [ProductionResult & { employeeName, kind, resultStatus, amountFinal, adjustments, targetsDrift, hasTargets }], history } }`; `POST .../stock-approvals`; `POST .../close/:schemeId`; `POST .../adjust/:schemeId`; `POST .../paid/:schemeId`; `GET /api/bonuses/years/:year` → `{ data: [{ schemeId, employeeName, year: computeYear() }] }`; `POST /api/bonuses/years/:year/close/:schemeId`.

- [ ] **Step 1: Тесты**

```js
test('расчёт периода, склад, закрытие, корректировка, выплата, год', async (t) => {
  const { port, cookie } = await setup(t);
  const employeeId = Date.now();
  const base = employeeId * 10;
  await putCompatRow('employees', { id: employeeId, name: 'Лёша', role: 'production', is_active: true });
  await putCompatRow('orders', { id: base + 1, order_name: 'А', status: 'completed', production_purpose: 'commercial', total_hours_plan: 1500, deadline: '2026-09-20', completed_at: '2026-09-10T10:00:00.000Z' });
  await putCompatRow('orders', { id: base + 2, order_name: 'Склад', status: 'completed', production_purpose: 'stock_sample', total_hours_plan: 100, completed_at: '2026-09-11T10:00:00.000Z' });
  await putCompatRow('time_entries', { id: base + 1, employee_id: employeeId, date: '2026-09-01', hours: 1500, order_id: base + 1 });

  const scheme = (await (await requestJson(port, 'PUT', `/api/bonuses/schemes/${employeeId}`, { kind: 'production', rate: 75 }, cookie)).json()).data;
  await requestJson(port, 'PUT', `/api/bonuses/periods/2026-Q3/targets/${scheme.id}`, { targets: {
    output_hours: { min: 1330, target: 1512, max: 1693 }, productivity: { min: 0.9, target: 1, max: 1.15 },
    on_time_share: { min: 0.7, target: 0.85, max: 0.95 }, rework_share: { min: 0.08, target: 0.05, max: 0.02 },
  } }, cookie);

  let res = await requestJson(port, 'GET', '/api/bonuses/periods/2026-Q3', undefined, cookie);
  assert.equal(res.status, 200);
  let entry = (await res.json()).data.entries.find((e) => e.schemeId === scheme.id);
  assert.equal(entry.employeeName, 'Лёша');
  assert.equal(entry.output.fact, 1500);
  assert.equal(entry.orders.find((o) => o.id === base + 2).included, false);

  await requestJson(port, 'POST', '/api/bonuses/periods/2026-Q3/stock-approvals', { order_id: base + 2, approved: true }, cookie);
  res = await requestJson(port, 'GET', '/api/bonuses/periods/2026-Q3', undefined, cookie);
  entry = (await res.json()).data.entries.find((e) => e.schemeId === scheme.id);
  assert.equal(entry.output.fact, 1600);

  res = await requestJson(port, 'POST', `/api/bonuses/periods/2026-Q3/close/${scheme.id}`, {}, cookie);
  assert.equal(res.status, 200);
  const closed = (await res.json()).data;
  assert.equal(closed.status, 'closed');
  assert.ok(Number(closed.amount_computed) > 0);

  await putCompatRow('orders', { id: base + 3, order_name: 'Поздний', status: 'completed', production_purpose: 'commercial', total_hours_plan: 500, deadline: '2026-09-20', completed_at: '2026-09-12T10:00:00.000Z' });
  res = await requestJson(port, 'GET', '/api/bonuses/periods/2026-Q3', undefined, cookie);
  entry = (await res.json()).data.entries.find((e) => e.schemeId === scheme.id);
  assert.equal(entry.output.fact, 1600);
  assert.equal(entry.resultStatus, 'closed');

  res = await requestJson(port, 'POST', `/api/bonuses/periods/2026-Q3/adjust/${scheme.id}`, { amount: 90000 }, cookie);
  assert.equal(res.status, 400);
  res = await requestJson(port, 'POST', `/api/bonuses/periods/2026-Q3/adjust/${scheme.id}`, { amount: 90000, comment: 'Согласовано лично' }, cookie);
  const adjusted = (await res.json()).data;
  assert.equal(Number(adjusted.amount_final), 90000);
  assert.equal(adjusted.adjustments_json[0].comment, 'Согласовано лично');

  res = await requestJson(port, 'POST', `/api/bonuses/periods/2026-Q3/paid/${scheme.id}`, {}, cookie);
  assert.equal((await res.json()).data.status, 'paid');

  res = await requestJson(port, 'GET', '/api/bonuses/years/2026', undefined, cookie);
  const yearEntry = (await res.json()).data.find((e) => e.schemeId === scheme.id);
  assert.equal(yearEntry.year.quartersCounted, 1);
  assert.equal(yearEntry.year.quarters.find((q) => q.period === '2026-Q3').fact, 1600);

  res = await requestJson(port, 'POST', `/api/bonuses/years/2026/close/${scheme.id}`, {}, cookie);
  assert.equal((await res.json()).data.period, '2026-Y');
});

test('закрытие без целей периода → 400', async (t) => {
  const { port, cookie } = await setup(t);
  const employeeId = Date.now();
  await putCompatRow('employees', { id: employeeId, name: 'Тест', role: 'production', is_active: true });
  const scheme = (await (await requestJson(port, 'PUT', `/api/bonuses/schemes/${employeeId}`, { kind: 'production', rate: 1 }, cookie)).json()).data;
  const res = await requestJson(port, 'POST', `/api/bonuses/periods/2027-Q1/close/${scheme.id}`, {}, cookie);
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

```bash
cd ops/api && TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" node --test test/bonuses-routes.test.js
```

- [ ] **Step 3: Реализация**

Импорт:

```js
import { computeProductionPeriod, computeYear } from '../bonuses/calc.js';
```

Маршруты перед `export default router;`:

```js
function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

async function computeEntry(scheme, period, legacy, approvals) {
  const targets = await store.getTargets(scheme.id, period);
  const names = new Map(legacy.employees.map((e) => [String(e.id), String(e.name || '')]));
  const existing = await store.getResult(scheme.id, period);
  const suggestion = suggestProductionTargets({ period, settings: legacy.settings });
  const targetsDrift = !!(targets?.output_hours && Number(targets.output_hours.target) !== Number(suggestion.targets.output_hours.target));
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
    for (const row of (await store.listResults(scheme.id)).filter((r) => r.status !== 'open')) {
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
  res.json({ data: await store.saveResult({ ...existing, amount_final: amount, adjustments_json: adjustments }) });
}));

router.post('/periods/:period/paid/:schemeId', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const scheme = await schemeOr404(res, req.params.schemeId);
  if (!scheme) return;
  const existing = await store.getResult(scheme.id, period);
  if (!existing || existing.status === 'open') return error(res, 400, 'NOT_CLOSED', 'Сначала закройте период');
  res.json({ data: await store.saveResult({ ...existing, status: 'paid', paid_at: new Date().toISOString() }) });
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
      quarters.push({
        period,
        thresholds: targets?.output_hours || null,
        fact: targets ? entry.output.fact : null,
        achievement: targets ? entry.output.achievement : null,
        resultStatus: entry.resultStatus,
      });
    }
    out.push({ schemeId: scheme.id, employeeName: names.get(String(scheme.employee_id)) || '', year: computeYear({ year, scheme, quarters }) });
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

- [ ] **Step 4: Полный прогон API**

```bash
cd ops/api && TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" npm test
```

- [ ] **Step 5: Commit**

```bash
git add ops/api/src/routes/bonuses.js ops/api/test/bonuses-routes.test.js
git commit -m "Add bonus period computation, close, adjust and year API"
```

---

### Task 7b: План и факт по деньгам отдела в API

**Files:**
- Modify: `ops/api/src/bonuses/store.js`, `ops/api/src/routes/bonuses.js`
- Test: `ops/api/test/bonuses-routes.test.js`

**Interfaces:**
- Produces (`store.js`): `getTeamTargets(team, period)` → `{ [metric_key]: {min,target,max} } | null`; `upsertTeamTargets(team, period, targets)`; `getTeamFacts(team, period)` → `{ [metric_key]: { value, source, note, updated_by, updated_at } }`; `setTeamFact(team, period, metricKey, { value, source, note }, by)`.
- Produces: `GET /api/bonuses/periods/:period/team/commercial` → `{ data: { targets, facts } }`; `PUT` с телом `{ targets?: { cash_in: {min,target,max} }, facts?: { cash_in: { value, note } } }`.
- `GET /api/bonuses/periods/:period` дополнительно отдаёт `team: { commercial: { targets, facts, cashAchievement } }`, а каждый production-entry считается с `teamMoney`.

- [ ] **Step 1: Тесты**

```js
test('план и факт по деньгам отдела влияют на уровень производства', async (t) => {
  const { port, cookie } = await setup(t);
  const employeeId = Date.now();
  const base = employeeId * 10;
  await putCompatRow('employees', { id: employeeId, name: 'Лёша', role: 'production', is_active: true });
  await putCompatRow('orders', { id: base + 1, order_name: 'А', status: 'completed', production_purpose: 'commercial', total_hours_plan: 1550, deadline: '2026-09-20', completed_at: '2026-09-10T10:00:00.000Z' });
  await putCompatRow('time_entries', { id: base + 1, employee_id: employeeId, date: '2026-09-01', hours: 1550, order_id: base + 1 });
  const scheme = (await (await requestJson(port, 'PUT', `/api/bonuses/schemes/${employeeId}`, { kind: 'production', rate: 75 }, cookie)).json()).data;
  await requestJson(port, 'PUT', `/api/bonuses/periods/2026-Q3/targets/${scheme.id}`, { targets: {
    output_hours: { min: 1330, target: 1512, max: 1693 }, productivity: { min: 0.9, target: 1, max: 1.15 },
    on_time_share: { min: 0.7, target: 0.85, max: 0.95 }, rework_share: { min: 0.08, target: 0.05, max: 0.02 },
  } }, cookie);

  let res = await requestJson(port, 'GET', '/api/bonuses/periods/2026-Q3', undefined, cookie);
  let entry = (await res.json()).data.entries.find((e) => e.schemeId === scheme.id);
  assert.ok(entry.warnings.some((w) => w.code === 'no_money_plan'));

  res = await requestJson(port, 'PUT', '/api/bonuses/periods/2026-Q3/team/commercial', {
    targets: { cash_in: { min: 14000000, target: 15500000, max: 17000000 } },
    facts: { cash_in: { value: 14400000, note: 'Финтабло, Recycle Object, 15.09' } },
  }, cookie);
  assert.equal(res.status, 200);
  const team = (await res.json()).data;
  assert.equal(team.facts.cash_in.value, 14400000);
  assert.equal(team.facts.cash_in.source, 'manual');

  res = await requestJson(port, 'GET', '/api/bonuses/periods/2026-Q3', undefined, cookie);
  const body = (await res.json()).data;
  entry = body.entries.find((e) => e.schemeId === scheme.id);
  assert.ok(Math.abs(entry.money.achievement - 0.6333) < 0.001);
  assert.ok(Math.abs(entry.level - 0.9635) < 0.001);
  assert.ok(Math.abs(body.team.commercial.cashAchievement - 0.6333) < 0.001);

  res = await requestJson(port, 'PUT', '/api/bonuses/periods/2026-Q3/team/commercial', { facts: { cash_in: { value: -5 } } }, cookie);
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

```bash
cd ops/api && TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" node --test test/bonuses-routes.test.js
```

- [ ] **Step 3: store.js**

```js
export async function getTeamTargets(team, period, client = getPool()) {
  const { rows } = await client.query(
    `SELECT metric_key, min_value, target_value, max_value FROM bonus_team_targets WHERE team = $1 AND period = $2`,
    [team, period],
  );
  const targets = {};
  for (const row of rows) {
    targets[row.metric_key] = { min: Number(row.min_value), target: Number(row.target_value), max: Number(row.max_value) };
  }
  return Object.keys(targets).length ? targets : null;
}

export async function upsertTeamTargets(team, period, targets, client = getPool()) {
  for (const [key, value] of Object.entries(targets)) {
    await client.query(
      `INSERT INTO bonus_team_targets (team, period, metric_key, min_value, target_value, max_value)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (team, period, metric_key)
       DO UPDATE SET min_value = EXCLUDED.min_value, target_value = EXCLUDED.target_value, max_value = EXCLUDED.max_value, updated_at = now()`,
      [team, period, key, Number(value.min), Number(value.target), Number(value.max)],
    );
  }
  return getTeamTargets(team, period, client);
}

export async function getTeamFacts(team, period, client = getPool()) {
  const { rows } = await client.query(
    `SELECT metric_key, value, source, note, updated_by, updated_at FROM bonus_team_facts WHERE team = $1 AND period = $2`,
    [team, period],
  );
  const facts = {};
  for (const row of rows) {
    facts[row.metric_key] = { value: Number(row.value), source: row.source, note: row.note, updated_by: row.updated_by, updated_at: row.updated_at };
  }
  return facts;
}

export async function setTeamFact(team, period, metricKey, { value, source = 'manual', note = '' }, by, client = getPool()) {
  await client.query(
    `INSERT INTO bonus_team_facts (team, period, metric_key, value, source, note, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (team, period, metric_key)
     DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [team, period, metricKey, Number(value), source, String(note || ''), by],
  );
  return getTeamFacts(team, period, client);
}
```

- [ ] **Step 4: routes/bonuses.js**

Добавить перед `computeEntry`:

```js
async function loadTeamMoney(period) {
  const [targets, facts] = await Promise.all([store.getTeamTargets('commercial', period), store.getTeamFacts('commercial', period)]);
  const thresholds = targets?.cash_in || null;
  const fact = facts.cash_in ? facts.cash_in.value : null;
  return { targets, facts, teamMoney: thresholds && fact !== null ? { fact, thresholds } : null };
}
```

`computeEntry(scheme, period, legacy, approvals, teamMoney)` получает пятый аргумент и передаёт `teamMoney` в `computeProductionPeriod`. В `GET /periods/:period` перед циклом:

```js
  const team = await loadTeamMoney(period);
```

в цикле `computeEntry(scheme, period, legacy, approvals, team.teamMoney)`, а в ответ добавить:

```js
  const cashAchievement = team.teamMoney ? achievement(team.teamMoney.fact, team.teamMoney.thresholds, 'higher', DEFAULT_LADDER) : null;
  res.json({ data: { period, entries, history, team: { commercial: { targets: team.targets, facts: team.facts, cashAchievement } } } });
```

(импортировать `achievement`, `DEFAULT_LADDER` из `../bonuses/calc.js`). В `close` и в `yearEntries` тоже передавать `teamMoney` того периода через `loadTeamMoney(period)`.

Маршруты:

```js
router.get('/periods/:period/team/commercial', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const { targets, facts } = await loadTeamMoney(period);
  res.json({ data: { targets, facts } });
}));

router.put('/periods/:period/team/commercial', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const targets = req.body?.targets;
  if (targets && typeof targets === 'object') {
    for (const [key, value] of Object.entries(targets)) {
      const values = [value?.min, value?.target, value?.max].map(Number);
      if (values.some((v) => !Number.isFinite(v))) return error(res, 400, 'INVALID_TARGETS', `Пороги ${key} должны быть числами`);
    }
    await store.upsertTeamTargets('commercial', period, targets);
  }
  const facts = req.body?.facts;
  if (facts && typeof facts === 'object') {
    for (const [key, fact] of Object.entries(facts)) {
      const value = Number(fact?.value);
      if (!Number.isFinite(value) || value < 0) return error(res, 400, 'INVALID_FACT', `Факт ${key} должен быть числом не меньше нуля`);
      await store.setTeamFact('commercial', period, key, { value, source: 'manual', note: fact?.note }, req.user.email);
    }
  }
  const { targets: savedTargets, facts: savedFacts } = await loadTeamMoney(period);
  res.json({ data: { targets: savedTargets, facts: savedFacts } });
}));
```

- [ ] **Step 5: Запустить**

```bash
cd ops/api && TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" npm test
```

- [ ] **Step 6: Commit**

```bash
git add ops/api/src/bonuses/store.js ops/api/src/routes/bonuses.js ops/api/test/bonuses-routes.test.js
git commit -m "Add team money plan and fact API"
```

---

### Task 8: Страница «Бонусы» в calc

**Files:**
- Create: `js/bonuses.js`
- Modify: `js/app.js:107-178` (`isOwner`, `canAccess`), `js/app.js:1247-1280` (`onPageEnter`)
- Modify: `index.html:258` (меню), рядом с `id="page-settings"` (контейнер), `index.html:3652-3654` (скрипт)
- Test: `test/bonuses_render.test.js`, `tests/bonuses-smoke.js`

**Interfaces:**
- Consumes: `/api/bonuses/*` (Task 6–7), `PLATFORM_API_URL` из `js/supabase.js`.
- Produces: глобальный `Bonuses` с `load()`; чистые функции `bonusesCurrentPeriod(date)`, `bonusesPeriodOptions(date)`, `formatRub(n)`, `formatHours(n)`, `formatMetricValue(key, value)`, `renderLevelBar(thresholds, fact, direction, labels)`, `renderOutputRow(output, rate)`, `renderQualityRow(metric)`, `renderBonusCard(entry, options)`, `renderWarnings(warnings)`, `renderHistory(history, entries)`, `renderYear(yearData, year)`.

- [ ] **Step 1: Тесты render-функций**

`test/bonuses_render.test.js`:

```js
const assert = require('node:assert');
const { test } = require('node:test');
const {
    bonusesCurrentPeriod, bonusesPeriodOptions, formatRub, formatMetricValue, renderOutputRow, renderQualityRow, renderBonusCard, renderWarnings,
} = require('../js/bonuses.js');

test('bonusesCurrentPeriod и bonusesPeriodOptions', () => {
    assert.equal(bonusesCurrentPeriod(new Date(2026, 8, 15)), '2026-Q3');
    assert.equal(bonusesCurrentPeriod(new Date(2026, 0, 2)), '2026-Q1');
    const options = bonusesPeriodOptions(new Date(2026, 8, 15));
    assert.equal(options.length, 8);
    assert.equal(options[0], '2024-Q4');
    assert.equal(options[7], '2026-Q3');
});

test('formatRub и formatMetricValue', () => {
    assert.equal(formatRub(153073), '153 073 ₽');
    assert.equal(formatMetricValue('output_hours', 1550), '1 550 ч');
    assert.equal(formatMetricValue('productivity', 1.0523), '1,05');
    assert.equal(formatMetricValue('on_time_share', 0.9), '90%');
    assert.equal(formatMetricValue('rework_share', null), '—');
});

test('renderOutputRow: уровни, факт, ставка, прогноз', () => {
    const html = renderOutputRow({
        fact: 1550, thresholds: { min: 1330, target: 1512, max: 1693 }, achievement: 1.105, rateApplied: 82.87,
        forecast: 1610, forecastAchievement: 1.27, forecastAmount: 170000,
    }, 75);
    assert.match(html, /bn-output/);
    assert.match(html, /1 550 ч/);
    assert.match(html, /1 330/);
    assert.match(html, /1 693/);
    assert.match(html, /уровень 1,11/);
    assert.match(html, /82,87 ₽\/ч/);
    assert.match(html, /прогноз 1 610 ч/);
});

test('renderQualityRow: доступный и недоступный показатель', () => {
    const ok = renderQualityRow({ key: 'on_time_share', label: 'В срок', direction: 'higher', weight: 0.3, thresholds: { min: 0.7, target: 0.85, max: 0.95 }, fact: 0.9, achievement: 1.25, available: true });
    assert.match(ok, /90%/);
    assert.match(ok, /125%/);
    assert.match(ok, /вес 30%/);
    const none = renderQualityRow({ key: 'productivity', label: 'Производительность', direction: 'higher', weight: 0.5, thresholds: { min: 0.9, target: 1, max: 1.15 }, fact: null, achievement: 0.5, available: false });
    assert.match(none, /нет данных/);
    assert.match(none, /50%/);
});

test('renderBonusCard: формула, итог, детали под карточкой', () => {
    const html = renderBonusCard({
        schemeId: 7, employeeName: 'Лёша', kind: 'production', resultStatus: 'open', rate: 75,
        output: { fact: 1550, thresholds: { min: 1330, target: 1512, max: 1693 }, achievement: 1.105, rateApplied: 82.87, forecast: null, forecastAchievement: null, forecastAmount: null },
        quality: { multiplier: 1.1917, metrics: [] },
        amountComputed: 153073, amountFinal: null, warnings: [],
        orders: [{ id: 1, name: 'Заказ', purpose: 'commercial', hoursPlan: 10, hoursFact: 9, deadline: '2026-09-20', completedAt: '2026-09-10', estimated: false, onTime: true, approved: null, included: true }],
        adjustments: [], targetsDrift: false, hasTargets: true,
    }, { expanded: true });
    assert.match(html, /Лёша/);
    assert.match(html, /153 073 ₽/);
    assert.match(html, /1 550 ч × 82,87 ₽ × 1,19/);
    assert.match(html, /bn-card-details/);
    assert.match(html, /Закрыть квартал/);
});

test('renderWarnings', () => {
    const html = renderWarnings([{ code: 'unmarked_hours', count: 0, hours: 3, orderIds: [] }, { code: 'no_timesheet', count: 0, hours: 0, orderIds: [] }]);
    assert.match(html, /без заказа: 3 ч/);
    assert.match(html, /Табель по завершённым заказам пустой/);
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

Меню, перед ссылкой `data-page="settings"`:

```html
            <a href="#bonuses" data-page="bonuses">
                <span class="nav-icon">&#9733;</span>
                <span>Бонусы</span>
            </a>
```

Контейнер, перед `<div class="page" id="page-settings">` (тот же тег и класс, что у соседей):

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
// /api/bonuses/*; здесь выбор периода, отрисовка и действия.

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
.bn-total{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.bn-total small{display:block;font-size:14px;font-weight:400;color:#57606a}
.bn-row{display:grid;grid-template-columns:200px 1fr 150px 90px;gap:14px;align-items:center;padding:12px 0 18px;border-top:1px solid #eaeef2}
.bn-output{padding-top:16px}
.bn-label{font-weight:600}
.bn-label span{display:block;font-size:13px;color:#57606a;font-weight:400}
.bn-track{position:relative;height:14px;background:#eef1f4;border-radius:7px}
.bn-fill{position:absolute;left:0;top:0;bottom:0;background:#2da44e;border-radius:7px}
.bn-fill.below{background:#cf222e}.bn-fill.mid{background:#bf8700}
.bn-tick{position:absolute;top:-6px;width:2px;height:26px;background:#24292f}
.bn-tick-label{position:absolute;top:22px;transform:translateX(-50%);font-size:12px;color:#57606a;white-space:nowrap}
.bn-fact{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
.bn-fact span{display:block;font-size:13px;color:#57606a;font-weight:400}
.bn-ach{font-size:18px;font-variant-numeric:tabular-nums}
.bn-formula{margin-top:8px;padding:10px 14px;background:#f6f8fa;border-radius:8px;font-size:17px;font-variant-numeric:tabular-nums}
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
.bn-dialog-box{background:#fff;border-radius:12px;padding:20px 22px;min-width:460px;max-width:92vw;font-size:16px}
.bn-dialog-box label{display:block;margin:8px 0 4px}
.bn-dialog-box input,.bn-dialog-box select{width:100%;font-size:16px;padding:6px 8px;border:1px solid #d0d7de;border-radius:6px}
.bn-targets-grid{display:grid;grid-template-columns:200px repeat(3,1fr);gap:8px;align-items:center}
@media (max-width:800px){.bn-row{grid-template-columns:1fr 1fr} .bn-track{grid-column:1/-1;margin-bottom:18px}}
`;

function bonusesCurrentPeriod(date = new Date()) {
    return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
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

function bonusesNum(value, digits = 0) {
    return Number(value || 0).toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace(/ /g, ' ');
}

function formatRub(value) {
    return `${bonusesNum(Math.round(Number(value) || 0))} ₽`;
}

function formatHours(value) {
    return `${bonusesNum(Math.round(Number(value) || 0))} ч`;
}

function formatMetricValue(key, value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    switch (key) {
        case 'output_hours': return formatHours(value);
        case 'productivity': return bonusesNum(value, 2);
        case 'on_time_share':
        case 'rework_share': return `${Math.round(Number(value) * 100)}%`;
        default: return String(value);
    }
}

function bonusesTrackPercent(value, thresholds, direction) {
    const lower = direction === 'lower';
    const lo = lower ? Number(thresholds.max) : Number(thresholds.min);
    const hi = lower ? Number(thresholds.min) : Number(thresholds.max);
    const span = hi - lo || 1;
    const v = lower ? (hi - Number(value)) + lo : Number(value);
    return Math.max(0, Math.min(1, ((v - lo) / span) * 0.8 + 0.1)) * 100;
}

function renderLevelBar(thresholds, fact, direction, key, achievement) {
    if (!thresholds) return '<div class="bn-track"></div>';
    const ach = Number(achievement) || 0;
    const fillClass = ach === 0 ? 'below' : (ach < 1 ? 'mid' : '');
    const fill = fact === null || fact === undefined ? '' : `<div class="bn-fill ${fillClass}" style="width:${bonusesTrackPercent(fact, thresholds, direction).toFixed(1)}%"></div>`;
    const ticks = ['min', 'target', 'max'].map((k) => {
        const pct = bonusesTrackPercent(thresholds[k], thresholds, direction).toFixed(1);
        return `<div class="bn-tick" style="left:${pct}%"></div><div class="bn-tick-label" style="left:${pct}%">${bonusesEscape(formatMetricValue(key, thresholds[k]))}</div>`;
    }).join('');
    return `<div class="bn-track">${fill}${ticks}</div>`;
}

function renderOutputRow(output, rate) {
    const forecast = output.forecast !== null && output.forecast !== undefined
        ? `<span>прогноз ${bonusesEscape(formatHours(output.forecast))}, если темп сохранится</span>`
        : '';
    const level = output.achievement === null || output.achievement === undefined ? '—' : `уровень ${bonusesNum(output.achievement, 2)}`;
    return `<div class="bn-row bn-output">
        <div class="bn-label">Выпуск, нормо-часы<span>base / medium / aspiration</span></div>
        ${renderLevelBar(output.thresholds, output.fact, 'higher', 'output_hours', output.achievement)}
        <div class="bn-fact">${bonusesEscape(formatHours(output.fact))}${forecast}</div>
        <div class="bn-ach">${level}<span class="bn-muted" style="display:block;font-size:13px">${bonusesNum(output.rateApplied, 2)} ₽/ч из ${bonusesNum(rate)}</span></div>
    </div>`;
}

function renderQualityRow(metric) {
    const weightPct = Math.round((Number(metric.weight) || 0) * 100);
    const fact = metric.available ? bonusesEscape(formatMetricValue(metric.key, metric.fact)) : '<span class="bn-muted">нет данных</span>';
    return `<div class="bn-row" data-metric="${bonusesEscape(metric.key)}">
        <div class="bn-label">${bonusesEscape(metric.label)}<span>вес ${weightPct}%${metric.direction === 'lower' ? ' · меньше лучше' : ''}</span></div>
        ${renderLevelBar(metric.thresholds, metric.available ? metric.fact : null, metric.direction, metric.key, metric.achievement)}
        <div class="bn-fact">${fact}</div>
        <div class="bn-ach">${Math.round((Number(metric.achievement) || 0) * 100)}%</div>
    </div>`;
}

const BONUSES_WARNING_TEXT = {
    no_hours: (w) => `Заказы без нормо-часов, в выпуск не вошли: ${w.count}`,
    no_deadline: (w) => `Заказы без дедлайна, не учтены в «В срок»: ${w.count}`,
    estimated_dates: (w) => `Дата завершения оценочная (по табелю или последнему изменению): ${w.count}`,
    unmarked_hours: (w) => `Часы табеля без заказа: ${bonusesEscape(bonusesNum(w.hours, 1))} ч`,
    no_timesheet: () => 'Табель по завершённым заказам пустой: производительность взята по минимуму (0,5)',
    no_deadline_orders: () => 'Нет завершённых заказов с дедлайном: «В срок» взято нейтрально (1,0)',
    no_period_hours: () => 'Нет часов табеля за период: «Переделки» взяты нейтрально (1,0)',
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
    return `<div class="bn-warnings"><ul style="margin:0;padding-left:18px">${items}</ul></div>`;
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
    const output = entry.output || {};
    const quality = entry.quality || { multiplier: 0, metrics: [] };
    const total = entry.amountFinal !== null && entry.amountFinal !== undefined && Number(entry.amountFinal) !== Number(entry.amountComputed)
        ? `${formatRub(entry.amountFinal)}<small>расчёт ${formatRub(entry.amountComputed)}</small>`
        : `${formatRub(entry.amountComputed)}${output.forecastAmount ? `<small>прогноз ${formatRub(output.forecastAmount)}</small>` : ''}`;
    const drift = entry.targetsDrift ? '<div class="bn-warnings">Сезонный план изменился после сохранения целей. Откройте «Цели квартала», чтобы пересохранить.</div>' : '';
    const noTargets = !entry.hasTargets ? '<div class="bn-warnings">Цели квартала не заданы. Нажмите «Цели квартала».</div>' : '';
    const formula = entry.hasTargets
        ? `<div class="bn-formula">${bonusesEscape(formatHours(output.fact))} × ${bonusesNum(output.rateApplied, 2)} ₽ × ${bonusesNum(quality.multiplier, 2)} = <b>${formatRub(entry.amountComputed)}</b></div>`
        : '';
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
            <div class="bn-status">производство · ставка ${bonusesNum(entry.rate)} ₽ за нормо-час на уровне medium · период ${bonusesStatusLabel(entry.resultStatus)}</div></div>
            <div class="bn-total">${total}</div>
        </div>
        ${noTargets}${drift}
        ${renderOutputRow(output, entry.rate)}
        ${(quality.metrics || []).map(renderQualityRow).join('')}
        <div class="bn-row"><div class="bn-label">Множитель качества</div><div></div><div class="bn-fact">${bonusesNum(quality.multiplier, 2)}</div><div></div></div>
        ${formula}
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
        const q = e.year.quarters.map((x) => `<td class="num">${x.fact === null ? '—' : formatHours(x.fact)}</td>`).join('');
        return `<tr><td>${bonusesEscape(e.employeeName)}</td>${q}
            <td class="num">${formatHours(e.year.factSum)} / ${formatHours(e.year.thresholdsSum.target)}</td>
            <td class="num">${e.year.achievement === null ? '—' : bonusesNum(e.year.achievement, 2)}</td>
            <td class="num">${formatRub(e.year.topUp)}</td>
            <td><button class="bn-btn" data-action="close-year" data-scheme="${e.schemeId}" ${e.year.quartersCounted === 4 ? '' : 'disabled'}>Закрыть год</button></td></tr>`;
    }).join('');
    return `<h2 class="bn-h2">Год ${year}: выпуск</h2><table class="bn-table"><thead><tr>
        <th>Сотрудник</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Факт / medium</th><th>Уровень года</th><th>Добор</th><th></th>
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
        cards.innerHTML = (entries.length
            ? entries.map((e) => renderBonusCard(e, { expanded: this.expanded.has(e.schemeId) })).join('')
            : '<div class="bn-muted">Схем пока нет.</div>')
            + '<div class="bn-actions"><button class="bn-btn" data-action="new-scheme">Новая схема</button></div>';
        document.getElementById('bonuses-year').innerHTML = renderYear(this.yearData, Number(this.period.slice(0, 4)));
        document.getElementById('bonuses-history').innerHTML = renderHistory(this.data?.history, entries);
    },

    bind() {
        if (this._bound) return;
        this._bound = true;
        const page = document.getElementById('page-bonuses');
        page.addEventListener('click', (event) => {
            const periodBtn = event.target.closest('[data-period]');
            if (periodBtn) { this.period = periodBtn.dataset.period; this.load(); return; }
            const btn = event.target.closest('[data-action]');
            if (btn) this.handleAction(btn.dataset.action, Number(btn.dataset.scheme));
        });
        page.addEventListener('change', (event) => {
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
        const box = this.dialog(`<h2 class="bn-h2">Схема производства</h2>
            <label>Сотрудник</label><select id="bn-scheme-employee">${options}</select>
            <label>Ставка за нормо-час на уровне medium, ₽</label><input id="bn-scheme-rate" type="number" value="75">
            <div class="bn-muted" style="margin-top:6px">base = ставка × 0,5; aspiration = ставка × 1,5; ниже base 0</div>
            <div class="bn-actions"><button class="bn-btn primary" id="bn-scheme-save">Сохранить</button><button class="bn-btn" data-dialog-close>Отмена</button></div>`);
        box.querySelector('#bn-scheme-save').addEventListener('click', async () => {
            const employeeId = Number(box.querySelector('#bn-scheme-employee').value);
            const rate = Number(box.querySelector('#bn-scheme-rate').value);
            await this.api('PUT', `/schemes/${employeeId}`, { kind: 'production', rate });
            box.remove();
            await this.load();
        });
    },

    async openTargetsDialog(schemeId) {
        const entry = (this.data?.entries || []).find((e) => e.schemeId === schemeId);
        const suggestion = await this.api('GET', `/periods/${this.period}/suggest/${schemeId}`);
        const current = {};
        if (entry?.output?.thresholds) current.output_hours = entry.output.thresholds;
        for (const m of entry?.quality?.metrics || []) if (m.thresholds) current[m.key] = m.thresholds;
        const keys = ['output_hours', 'productivity', 'on_time_share', 'rework_share'];
        const labels = { output_hours: 'Выпуск, ч (base / medium / aspiration)', productivity: 'Производительность', on_time_share: 'В срок (0–1)', rework_share: 'Переделки (0–1)' };
        const row = (key, values) => `<div>${labels[key]}</div>` + ['min', 'target', 'max'].map((k) => `<input type="number" step="any" data-key="${key}" data-k="${k}" value="${values?.[k] ?? ''}">`).join('');
        const box = this.dialog(`<h2 class="bn-h2">Цели ${this.period}</h2>
            <div class="bn-muted">Источник подсказки: ${suggestion.source === 'plan' ? 'сезонный план' : 'формула из настроек'}</div>
            <div class="bn-targets-grid"><div></div><div>мин / base</div><div>цель / medium</div><div>макс / aspiration</div>${keys.map((k) => row(k, current[k] || suggestion.targets[k])).join('')}</div>
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
        renderLevelBar, renderOutputRow, renderQualityRow, renderBonusCard, renderWarnings, renderHistory, renderYear,
    };
}
```

- [ ] **Step 7: Запустить**

```bash
node --test test/bonuses_render.test.js && node tests/bonuses-smoke.js
```

Ожидание: PASS и `bonuses-smoke: OK`. Проверка формулы в тесте карточки ждёт `1 550 ч × 82,87 ₽ × 1,19`: `bonusesNum(82.87, 2)` даёт `82,87`, `bonusesNum(1.1917, 2)` даёт `1,19`.

- [ ] **Step 8: Проверить в браузере**

Под владельцем: пункт «Бонусы» виден, «Новая схема» создаёт схему Лёши со ставкой 75, «Цели квартала» подтягивает три уровня из сезонного плана, карточка показывает выпуск, три показателя качества, множитель и формулу. Под сотрудником пункта нет, `#bonuses` уводит на заказы.

- [ ] **Step 9: Commit**

```bash
git add js/bonuses.js js/app.js index.html test/bonuses_render.test.js tests/bonuses-smoke.js
git commit -m "Add owner-only bonuses page"
```

---

### Task 8b: Блок «План квартала по деньгам» и уровень на карточке

**Files:**
- Modify: `js/bonuses.js`, `index.html` (контейнер `bonuses-team`)
- Test: `test/bonuses_render.test.js`

**Interfaces:**
- Produces: `renderTeamBlock(team, period)` → HTML; `renderLevelRow(entry)` → HTML; `Bonuses.openTeamDialog()`.

- [ ] **Step 1: Тесты**

```js
const { renderTeamBlock, renderLevelRow } = require('../js/bonuses.js');

test('renderTeamBlock: уровни, факт из Финтабло, A_cash', () => {
    const html = renderTeamBlock({ commercial: {
        targets: { cash_in: { min: 14000000, target: 15500000, max: 17000000 } },
        facts: { cash_in: { value: 14400000, source: 'manual', note: 'Финтабло 15.09', updated_at: '2026-09-15T10:00:00.000Z' } },
        cashAchievement: 0.6333,
    } }, '2026-Q3');
    assert.match(html, /bn-team/);
    assert.match(html, /14 400 000 ₽/);
    assert.match(html, /14 000 000/);
    assert.match(html, /17 000 000/);
    assert.match(html, /уровень 0,63/);
    assert.match(html, /Финтабло 15\.09/);
    assert.match(html, /План и факт по деньгам/);
});

test('renderTeamBlock: без плана', () => {
    const html = renderTeamBlock({ commercial: { targets: null, facts: {}, cashAchievement: null } }, '2026-Q3');
    assert.match(html, /План по деньгам за квартал не задан/);
});

test('renderLevelRow: формула уровня', () => {
    const html = renderLevelRow({ rate: 75, level: 0.9635, output: { achievement: 1.105, rateApplied: 72.26 }, money: { achievement: 0.6333 } });
    assert.match(html, /0,7 × 1,10 \+ 0,3 × 0,63 = 0,96/);
    assert.match(html, /72,26 ₽\/ч/);
    const noMoney = renderLevelRow({ rate: 75, level: 1.105, output: { achievement: 1.105, rateApplied: 82.87 }, money: { achievement: null } });
    assert.match(noMoney, /план по деньгам не задан/);
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

```bash
node --test test/bonuses_render.test.js
```

- [ ] **Step 3: index.html**

В контейнере `page-bonuses` между `.bn-toolbar` и `bonuses-cards`:

```html
                <div id="bonuses-team" class="bn-team-wrap"></div>
```

- [ ] **Step 4: js/bonuses.js**

Добавить в `BONUSES_CSS`:

```
.bn-team{border:1px solid #d0d7de;border-radius:12px;background:#f6f8fa;padding:16px 20px;margin-bottom:18px}
.bn-team-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.bn-team-title{font-size:18px;font-weight:600}
.bn-level{background:#eef6ff;border-radius:8px;padding:8px 14px;font-size:16px;margin:6px 0 4px;font-variant-numeric:tabular-nums}
```

Функции:

```js
function formatMoney(value) {
    return `${bonusesNum(Math.round(Number(value) || 0))} ₽`;
}

function renderTeamBlock(team, period) {
    const c = team?.commercial || {};
    const thresholds = c.targets?.cash_in || null;
    const fact = c.facts?.cash_in || null;
    const button = `<button class="bn-btn" data-action="team-money">План и факт по деньгам</button>`;
    if (!thresholds) {
        return `<div class="bn-team"><div class="bn-team-head"><div class="bn-team-title">Деньги квартала ${bonusesEscape(period)}</div>${button}</div>
            <div class="bn-warnings">План по деньгам за квартал не задан. Уровень производства считается только по часам.</div></div>`;
    }
    const ticks = ['min', 'target', 'max'].map((k) => {
        const pct = bonusesTrackPercent(thresholds[k], thresholds, 'higher').toFixed(1);
        return `<div class="bn-tick" style="left:${pct}%"></div><div class="bn-tick-label" style="left:${pct}%">${bonusesNum(thresholds[k])}</div>`;
    }).join('');
    const ach = c.cashAchievement;
    const fill = fact ? `<div class="bn-fill ${!ach ? 'below' : (ach < 1 ? 'mid' : '')}" style="width:${bonusesTrackPercent(fact.value, thresholds, 'higher').toFixed(1)}%"></div>` : '';
    const factHtml = fact
        ? `<div class="bn-fact">${formatMoney(fact.value)}<span>${bonusesEscape(fact.note || 'Финтабло, направление Recycle Object')} · ${bonusesEscape(String(fact.updated_at || '').slice(0, 10))}</span></div>`
        : '<div class="bn-fact bn-muted">факт не введён</div>';
    return `<div class="bn-team"><div class="bn-team-head"><div class="bn-team-title">Деньги квартала ${bonusesEscape(period)} · поступления Recycle Object по Финтабло</div>${button}</div>
        <div class="bn-row" style="border-top:0">
            <div class="bn-label">План отдела<span>base / medium / aspiration</span></div>
            <div class="bn-track">${fill}${ticks}</div>
            ${factHtml}
            <div class="bn-ach">${ach === null || ach === undefined ? '—' : `уровень ${bonusesNum(ach, 2)}`}</div>
        </div></div>`;
}

function renderLevelRow(entry) {
    const outA = entry.output?.achievement;
    const cashA = entry.money?.achievement;
    if (outA === null || outA === undefined) return '';
    const formula = cashA === null || cashA === undefined
        ? `уровень квартала ${bonusesNum(entry.level, 2)} = уровень по часам (план по деньгам не задан)`
        : `уровень квартала 0,7 × ${bonusesNum(outA, 2)} + 0,3 × ${bonusesNum(cashA, 2)} = ${bonusesNum(entry.level, 2)}`;
    return `<div class="bn-level">${formula} → ставка ${bonusesNum(entry.output.rateApplied, 2)} ₽/ч из ${bonusesNum(entry.rate)}</div>`;
}
```

В `renderOutputRow` убрать подпись со ставкой из `.bn-ach` (оставить `уровень по часам X`), а в `renderBonusCard` после `renderOutputRow(...)` вставить `${renderLevelRow(entry)}`. В `render()` перед карточками:

```js
        document.getElementById('bonuses-team').innerHTML = renderTeamBlock(this.data?.team, this.period);
```

В `handleAction` ветка:

```js
            } else if (action === 'team-money') {
                await this.openTeamDialog();
```

и метод:

```js
    async openTeamDialog() {
        const current = await this.api('GET', `/periods/${this.period}/team/commercial`);
        const t = current.targets?.cash_in || {};
        const f = current.facts?.cash_in || {};
        const box = this.dialog(`<h2 class="bn-h2">Деньги квартала ${this.period}</h2>
            <div class="bn-targets-grid"><div>План, ₽</div><div>base</div><div>medium</div><div>aspiration</div>
            <div></div><input id="bn-team-min" type="number" value="${t.min ?? ''}"><input id="bn-team-target" type="number" value="${t.target ?? ''}"><input id="bn-team-max" type="number" value="${t.max ?? ''}"></div>
            <label>Факт: поступления Recycle Object по Финтабло, ₽</label><input id="bn-team-fact" type="number" value="${f.value ?? ''}">
            <label>Комментарий (откуда цифра, дата)</label><input id="bn-team-note" type="text" value="${bonusesEscape(f.note || '')}">
            <div class="bn-actions"><button class="bn-btn primary" id="bn-team-save">Сохранить</button><button class="bn-btn" data-dialog-close>Отмена</button></div>`);
        box.querySelector('#bn-team-save').addEventListener('click', async () => {
            const body = {};
            const min = Number(box.querySelector('#bn-team-min').value);
            const target = Number(box.querySelector('#bn-team-target').value);
            const max = Number(box.querySelector('#bn-team-max').value);
            if ([min, target, max].every((v) => Number.isFinite(v) && v > 0)) body.targets = { cash_in: { min, target, max } };
            const factValue = box.querySelector('#bn-team-fact').value;
            if (factValue !== '') body.facts = { cash_in: { value: Number(factValue), note: box.querySelector('#bn-team-note').value } };
            await this.api('PUT', `/periods/${this.period}/team/commercial`, body);
            box.remove();
            await this.load();
        });
    },
```

Экспорт: добавить `renderTeamBlock, renderLevelRow, formatMoney` в `module.exports`. В тесте `renderOutputRow` заменить ожидание `82,87 ₽\/ч` на `уровень по часам 1,11`.

- [ ] **Step 5: Запустить**

```bash
node --test test/bonuses_render.test.js && node tests/bonuses-smoke.js
```

- [ ] **Step 6: Commit**

```bash
git add js/bonuses.js index.html test/bonuses_render.test.js
git commit -m "Show team money plan and quarter level on bonuses page"
```

---

### Task 9: Версия, полный прогон, PR

**Files:**
- Modify: `js/version.json`, `js/app.js:5`, `index.html:10`, `index.html:190`, `?v=` у `js/app.js` и `js/bonuses.js`.

- [ ] **Step 1: Версия main и бамп**

```bash
git fetch origin main && git show origin/main:js/version.json
```

Взять `vN`, поставить `v(N+1)` в четырёх якорях. Поднять `?v=` у `js/app.js` на +1, оставить `js/bonuses.js?v=1`.

- [ ] **Step 2: Smokes**

```bash
node tests/version-smoke.js && node tests/bonuses-smoke.js && node --test test/bonuses_render.test.js test/production_load.test.js && node tests/order-flow-smoke.js
```

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

После merge: следить за `Deploy GitHub Pages`, `Yandex static sync`, `Live site smoke`, `Yandex mirror smoke` и деплоем `ops/**` (миграция 019 применится автоматически). Затем повторить Task 0 на проде и создать схему Лёши через страницу.
