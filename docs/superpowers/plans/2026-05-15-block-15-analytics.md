# Block 15 — Analytics Implementation Plan

> **REQUIRED:** мастер-плейбук + Blocks 9 (orders) + 14 (time).

**Goal:** Перенести аналитические отчёты. Пользователь сказал: *"Аналитика: пользуемся, но она сложная, прям то есть пока еще много багов, нужно будет много всего доделывать."* — то есть переносим с известными багами, фиксы — отдельно после Stage D.

**Source reference:** `js/analytics.js`.

**Dependencies:** Blocks 9, 14.

**Branch:** `block-15-analytics`

---

## File Structure

| File | Action |
|------|--------|
| `ops/api/src/routes/analytics.js` | API: эндпойнты-отчёты (не таблицы) |
| `ops/api/src/analytics/queries.ts` | SQL запросы для каждого отчёта |
| `ops/web/src/views/AnalyticsView.vue` | Главная страница с переключателями отчётов |
| `ops/web/src/components/analytics/*.vue` | По одному компоненту на тип отчёта |

Никаких новых таблиц — только SELECT'ы.

---

## Task 1: Перечислить отчёты

Прочитать `js/analytics.js` и перечислить все отчёты, которые он генерирует. Примерно:
- Выручка и маржа по месяцам
- Loaded hours (загрузка по сотрудникам)
- Топ-клиенты
- Динамика заказов по статусам
- Производственная загрузка по типам товара
- Marketplace продажи (если есть)

Записать в `ops/api/src/analytics/README.md` список со ссылками на JS-функции.

- [ ] Commit: `Document analytics reports inventory`

---

## Task 2: SQL запросы

В `ops/api/src/analytics/queries.ts`:

```ts
import { getPool } from '../db.js';

export async function revenueByMonth(yearFrom: number, yearTo: number) {
  const { rows } = await getPool().query(`
    SELECT
      DATE_TRUNC('month', created_at)::date AS month,
      SUM(total_revenue) AS revenue,
      SUM(total_cost) AS cost,
      SUM(total_margin) AS margin,
      COUNT(*) AS orders_count
    FROM orders
    WHERE created_at >= make_date($1, 1, 1) AND created_at < make_date($2 + 1, 1, 1)
      AND status NOT IN ('draft', 'cancelled')
    GROUP BY 1
    ORDER BY 1
  `, [yearFrom, yearTo]);
  return rows;
}

export async function topClients(period: { from: string; to: string }, limit = 20) {
  const { rows } = await getPool().query(`
    SELECT client_name, SUM(total_revenue) AS revenue, COUNT(*) AS orders_count
    FROM orders
    WHERE created_at BETWEEN $1 AND $2 AND status NOT IN ('draft','cancelled')
    GROUP BY client_name
    ORDER BY revenue DESC
    LIMIT $3
  `, [period.from, period.to, limit]);
  return rows;
}

// ... остальные отчёты, по одной функции на отчёт
```

- [ ] Commit: `Add analytics SQL queries`

---

## Task 3: API endpoints

В `analytics.js`:

```js
router.get('/revenue-by-month', requireAuth, async (req, res) => {
  const data = await revenueByMonth(Number(req.query.year_from), Number(req.query.year_to));
  res.json({ data });
});

router.get('/top-clients', requireAuth, async (req, res) => {
  const data = await topClients({ from: req.query.from, to: req.query.to }, Number(req.query.limit || 20));
  res.json({ data });
});

// и так далее
```

- [ ] Тесты: ≥ 5 (по одному на отчёт минимально, с подготовленными данными).
- [ ] Commit: `Add analytics API endpoints`

---

## Task 4: Vue экраны

`AnalyticsView.vue` — табы или select со списком отчётов. Каждый отчёт — отдельный компонент.

Использовать **уже имеющуюся в старом коде** chart-библиотеку (Chart.js или подобную) — посмотри в `index.html` какая подключена сейчас.

Графики:
- Revenue by month — bar chart
- Top clients — table
- Production load — stacked bar
- ...

Не пытайся идеально вылизать. Перенеси как было.

- [ ] Commits

---

## Task 5: PR + merge

## Acceptance Criteria

- [ ] На staging: каждый отчёт открывается, показывает данные
- [ ] Сравнить 2-3 отчёта с цифрами из старой системы за тот же период — должны совпадать (с поправкой на refresh-staging свежесть)
- [ ] Известные баги старой системы записать в issue tracker — не фиксить здесь
