# Витрина: загрузка месяца — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показать на витрине цеха загрузку месяца по фин-модели: расчётный план часов, закрытые часы, остаток и темп (превышаем/в графике/не добираем).

**Architecture:** Publisher добавляет чистую функцию `buildMonthLoad(settings, timeEntries, today, holidaySet)` → блок `plan.json.month_load`; фронт рендерит панель на доске. Формулы совпадают с модулем «Факт»: target = `workers_count × hours_per_worker × work_load_ratio`; closed = сумма `time_entries.hours` за текущий месяц; темп — по рабочим дням. Спека: `docs/superpowers/specs/2026-07-09-floor-month-load-design.md`.

**Tech Stack:** Vanilla JS (без сборщика), Node ESM publisher, node:assert smoke-тесты.

## Global Constraints
- Публичный вывод: только часы — НИКАКИХ денег/ставок/PII/ключей.
- Все фото/JSON-ссылки и поведение прочих полей не менять.
- Витрина читает Supabase анонимно; `settings` и `time_entries` уже загружаются в publisher.

---

## Task 1: Publisher — buildMonthLoad + тест

**Files:**
- Modify: `scripts/production-floor-publish.mjs`
- Test: `tests/floor-month-load-smoke.js` (создать)
- Modify: `.github/workflows/deploy-pages.yml` (добавить тест в прогон)
- Modify: `tests/fixtures/production-floor-publish-fixture.json` (settings для формы)
- Modify: `tests/production-floor-publish-smoke.js` (проверка формы month_load)

**Interfaces:**
- Produces: `export function buildMonthLoad(settings, timeEntries, today, holidaySet)` → `{ month_label, target, closed, remaining, pct, expected_by_today, pace_delta, status } | null`; и `plan.json.month_load` того же вида.

- [ ] **Step 1: Сделать авто-запуск модуля условным (чтобы функцию можно было импортировать без сети)**

В конце `scripts/production-floor-publish.mjs` заменить:
```javascript
main().catch(err => {
    // On failure, do NOT overwrite the last good snapshot — just fail loudly.
    console.error('production-floor-publish FAILED:', err && err.stack ? err.stack : err);
    process.exit(1);
});
```
на:
```javascript
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    main().catch(err => {
        // On failure, do NOT overwrite the last good snapshot — just fail loudly.
        console.error('production-floor-publish FAILED:', err && err.stack ? err.stack : err);
        process.exit(1);
    });
}
```
(`fileURLToPath` уже импортирован строкой `import { fileURLToPath } from 'node:url';`.)

- [ ] **Step 2: Написать падающий unit-тест `tests/floor-month-load-smoke.js`**

```javascript
import assert from 'node:assert/strict';
import { buildMonthLoad } from '../scripts/production-floor-publish.mjs';

// today фиксируем в середине месяца с известными рабочими днями.
const today = new Date(2026, 6, 9); // 9 июля 2026 (Чт)
const holidays = new Set();
const settings = { workers_count: '3.5', hours_per_worker: '168', work_load_ratio: '0.71' };
const te = [
  { date: '2026-07-01', hours: 8 }, { date: '2026-07-03', hours: 10 },
  { date: '2026-07-08', hours: 6 }, { date: '2026-06-30', hours: 99 }, // прошлый месяц — не считаем
];

const m = buildMonthLoad(settings, te, today, holidays);
assert.equal(m.target, 417.48, 'target = 3.5*168*0.71');
assert.equal(m.closed, 24, 'closed = only July entries (8+10+6)');
assert.equal(m.remaining, 393.48, 'remaining = target - closed');
assert.equal(m.pct, 6, 'pct = round(24/417.48*100)');
assert.ok(m.expected_by_today > 0 && m.expected_by_today < m.target, 'expected_by_today between 0 and target');
assert.ok(['ahead', 'on_track', 'behind'].includes(m.status), 'status is one of the three');
// нет настроек -> null
assert.equal(buildMonthLoad({}, te, today, holidays), null, 'no settings -> null');
console.log('floor-month-load-smoke: OK');
```

- [ ] **Step 3: Запустить тест — падает (функция не определена)**

Run: `node tests/floor-month-load-smoke.js`
Expected: FAIL — `buildMonthLoad is not a function` / import error.

- [ ] **Step 4: Реализовать `buildMonthLoad` в publisher**

Добавить константу рядом с `WEEKDAYS` (~строка 39):
```javascript
const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
```
Добавить функцию перед `toPublicPlan` (рядом с `buildMoldTransit`):
```javascript
// Загрузка месяца по фин-модели. target = workers_count*hours_per_worker*work_load_ratio
// (js/calculator.js getProductionParams). closed = сумма часов табеля за текущий
// месяц (у time_entries нет стадии — все записи считаются производственными, как
// legacy в js/factual.js). Темп — по рабочим дням. Только часы, без денег.
function buildMonthLoad(settings, timeEntries, today, holidaySet) {
    const n = v => { const x = Number(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(x) ? x : 0; };
    const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
    const target = r2(n((settings || {}).workers_count) * n((settings || {}).hours_per_worker) * n((settings || {}).work_load_ratio));
    if (!(target > 0)) return null;
    const y = today.getFullYear(), mo = today.getMonth();
    const monthStart = new Date(y, mo, 1), monthEnd = new Date(y, mo + 1, 0);
    const closed = r2((timeEntries || []).reduce((s, e) => {
        const raw = String((e && (e.date || e.work_date || e.created_at)) || '').slice(0, 10);
        const d = parseISO(raw);
        return (d && d >= monthStart && d <= monthEnd) ? s + (Number(e.hours) || 0) : s;
    }, 0));
    let wdTotal = 0, wdElapsed = 0;
    for (let d = new Date(monthStart); d <= monthEnd; d = addDays(d, 1)) {
        if (!isNonWorking(d, holidaySet)) { wdTotal += 1; if (d <= today) wdElapsed += 1; }
    }
    const expected = wdTotal > 0 ? r2(target * wdElapsed / wdTotal) : 0;
    const paceDelta = r2(closed - expected);
    const tol = Math.max(1, expected * 0.05);
    const status = paceDelta > tol ? 'ahead' : (paceDelta < -tol ? 'behind' : 'on_track');
    return {
        month_label: MONTH_NAMES[mo],
        target, closed,
        remaining: Math.max(0, r2(target - closed)),
        pct: target > 0 ? Math.round(closed / target * 100) : 0,
        expected_by_today: expected,
        pace_delta: paceDelta,
        status,
    };
}
```
Экспортировать: заменить `function buildMonthLoad(` на `export function buildMonthLoad(`.

- [ ] **Step 5: Подключить в `main` и вернуть в plan.json**

В `toPublicPlan`, в возвращаемом объекте после `mold_transit: buildMoldTransit(data.chinaPurchases),` добавить:
```javascript
        month_load: buildMonthLoad(data.settings, data.timeEntries, startOfToday(), holidaySet),
```
(`data.settings`, `data.timeEntries`, `holidaySet` уже доступны в `toPublicPlan`; `startOfToday()` — существующий helper.)

- [ ] **Step 6: Запустить unit-тест — проходит**

Run: `node tests/floor-month-load-smoke.js`
Expected: `floor-month-load-smoke: OK`.

- [ ] **Step 7: В фикстуре дать настройки, чтобы форма month_load была не null**

В `tests/fixtures/production-floor-publish-fixture.json` в объекте `settings` добавить (если ключей нет):
```json
"workers_count": "2", "hours_per_worker": "168", "work_load_ratio": "0.7"
```

- [ ] **Step 8: Проверка формы в `tests/production-floor-publish-smoke.js`**

После блока проверок `mold_transit` добавить:
```javascript
// ---- Загрузка месяца ----
assert.ok(plan.month_load && typeof plan.month_load === 'object', 'plan.month_load present');
assert.ok(plan.month_load.target > 0, 'month_load.target computed from settings');
for (const k of ['closed', 'remaining', 'pct', 'expected_by_today', 'pace_delta', 'status', 'month_label']) {
    assert.ok(k in plan.month_load, `month_load has ${k}`);
}
assert.ok(['ahead', 'on_track', 'behind'].includes(plan.month_load.status), 'month_load.status valid');
```

- [ ] **Step 9: Добавить тест в CI**

В `.github/workflows/deploy-pages.yml` после строки `node tests/production-floor-publish-smoke.js` (или рядом с прочими floor-smoke) добавить строку:
```
          node tests/floor-month-load-smoke.js
```

- [ ] **Step 10: Прогнать оба smoke**

Run:
```bash
node tests/floor-month-load-smoke.js
node tests/production-floor-publish-smoke.js
```
Expected: оба — exit 0.

- [ ] **Step 11: Commit**

```bash
git add scripts/production-floor-publish.mjs tests/floor-month-load-smoke.js tests/production-floor-publish-smoke.js tests/fixtures/production-floor-publish-fixture.json .github/workflows/deploy-pages.yml
git commit -m "floor: publish month-load (target vs closed hours + pace)"
```

---

## Task 2: Фронт — панель «Загрузка месяца»

**Files:**
- Modify: `production-floor/app.js` (`renderBoard`)
- Modify: `production-floor/style.css`

**Interfaces:**
- Consumes: `plan.month_load` (см. Task 1).

- [ ] **Step 1: Добавить рендер панели (функция перед `renderBoard`)**

В `production-floor/app.js` перед `function renderBoard(plan) {` добавить:
```javascript
  function monthLoadPanel(ml) {
    if (!ml || !(ml.target > 0)) return '';
    var pct = Math.max(0, Math.min(100, ml.pct || 0));
    var paceCls = ml.status === 'ahead' ? 'ok' : (ml.status === 'behind' ? 'bad' : 'muted');
    var d = Math.abs(Math.round(ml.pace_delta || 0));
    var paceTxt = ml.status === 'ahead' ? ('✅ Опережаем на ' + d + ' ч')
      : (ml.status === 'behind' ? ('⚠️ Не добираем ' + d + ' ч') : 'В графике');
    return '<div class="section"><div class="panel mload">' +
      '<div class="mload-head"><h2 style="margin:0;font-size:18px;font-weight:900">Загрузка месяца · ' + esc(ml.month_label) + '</h2>' +
      '<span class="badge ' + paceCls + '">' + paceTxt + '</span></div>' +
      '<div class="mload-nums"><b>' + num(ml.closed) + '</b> из <b>' + num(ml.target) + '</b> ч <small>· осталось ' + num(ml.remaining) + ' ч</small></div>' +
      '<div class="bar big"><i style="width:' + pct + '%"></i></div>' +
      '<div class="mload-hint">расчёт по фин-модели · табель за месяц</div>' +
      '</div></div>';
  }
```

- [ ] **Step 2: Вставить панель в `renderBoard` (после KPI-карточек, перед календарём)**

Найти в `renderBoard` строку, закрывающую блок `<div class="cards">…</div>`:
```javascript
      cardHtml(risk.lbl, risk.val, risk.cls) +
      '</div>' +
```
и сразу после неё добавить:
```javascript
      monthLoadPanel(plan.month_load) +
```

- [ ] **Step 3: CSS (в конец `production-floor/style.css`)**

```css
/* Загрузка месяца */
.mload-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.mload-nums { font-size: 22px; margin: 8px 0 6px; }
.mload-nums b { font-weight: 900; }
.bar.big { height: 14px; }
.mload-hint { color: var(--muted); font-size: 13px; margin-top: 6px; }
```

- [ ] **Step 4: Проверить в браузере на живых данных**

Run:
```bash
rm -rf /tmp/floorml && mkdir -p /tmp/floorml && cp production-floor/index.html production-floor/app.js production-floor/style.css /tmp/floorml/ && RO_FLOOR_OUT_DIR=/tmp/floorml node scripts/production-floor-publish.mjs && (python3 -m http.server 4183 --directory /tmp/floorml &) 
```
Открыть `http://localhost:4183/` — вверху доски панель «Загрузка месяца · Июль» с числами (≈138 из 417), баром и меткой темпа.

- [ ] **Step 5: Commit**

```bash
git add production-floor/app.js production-floor/style.css
git commit -m "floor UI: month-load panel (target vs closed + pace)"
```

---

## Self-Review
- **Spec coverage:** target/closed/remaining/pace/status → Task 1; панель → Task 2; приватность (только часы) → buildMonthLoad не трогает деньги + leak-аудит существующего smoke; `target=0 → null` → Task 1 unit-тест + фронт `if (!ml)`. Всё покрыто.
- **Типы согласованы:** `month_load` поля одинаковы в publisher, unit-тесте, smoke и фронте.
- **Плейсхолдеров нет:** весь код приведён.
