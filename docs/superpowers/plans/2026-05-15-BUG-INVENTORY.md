# Bug Inventory — что чиним по ходу миграции

> **Цель документа:** перечень известных багов, выясненных через анализ commit history (последние 60 дней) и архитектурный обзор. Этот список — побочный продукт миграции: мы не делаем баг-фикс-проект, мы устраняем целые классы багов сменой архитектуры.

> **Источник правды:** каждый bug → ссылка на commit в старом коде, где его пытались починить. Это доказывает, что баг реальный, не теоретический.

---

## A. Cache hell (5-уровневый fallback)

**Симптом:** «висит при сохранении», «после reload видны старые данные», «calc2 показывает не то».

**Где живёт:** `js/supabase.js` функции `_loadSameOriginBootstrap`, `_fetchJsonWithTimeout`, `_isLocalDatasetDirty`, `_clearLocalDatasetDirty`, переменная `WAREHOUSE_ITEMS_SETTINGS_KEY`.

**Commit'ы попыток починки:**
- 67bce31 Fix calc2 warehouse bootstrap load
- c6adcab Fix calc2 warehouse cache recovery
- 5c2e524 Recover warehouse from empty dirty cache
- 71ef139 Fix calc2 stale bootstrap cache
- 7722905 Fix calc2 stale version cache
- 0eeccbe Fix calc2 order detail stale cache
- 2d11a7d Protect calc2 local writes from stale bootstrap
- 619192f Refresh warehouse and China receipt reads from Supabase

**Как устраняется в миграции:** Single source of truth — Postgres напрямую через API. Никаких bootstrap'ов, snapshot'ов, dirty cache. Решается на уровне Block 3 (warehouse) + общая архитектура Block 1.

**Класс бага полностью исчезает после Stage C cutover.**

---

## B. Двойное списание / двойная приёмка

**Симптом:** «Нажала «принять» дважды, добавилось два раза», «списалось дважды при resave».

**Где живёт:** `js/warehouse.js#receiveShipment`, `js/order-detail.js#markProjectHardwareReady`, любой POST без идемпотентности.

**Commit'ы:**
- 61cf522 Deduplicate repeated order hardware rows
- 3113f72 Harden warehouse receipt writes
- 9fe2aa4 Make warehouse quantity edits cloud-safe
- 8646715 Serialize warehouse project hardware mutations

**Как устраняется:** Idempotency-Key middleware (Block 3 Task 2). На каждой мутирующей операции клиент генерирует UUID, бэк хранит результат для повторного вызова с тем же ключом.

**Гарантия:** на уровне API + транзакции БД. Параллельные клики из UI или сетевые retry'и не приведут к дублям.

---

## C. Фантомные/орфанные резервы

**Симптом:** «фурнитура числится зарезервированной, но заказа уже нет», «available_qty < 0 в реальности», «склад показывает что-то занято, а никто этого не помнит».

**Где живёт:** `js/orders.js` логика создания/освобождения резервов несимметрична — создаются легко, освобождаются по разным условиям.

**Commit'ы:**
- 741d40f Fix project hardware collection from reserved stock
- 52fd830 Keep project hardware state live-first
- ecbdc1d Fix project hardware ready refresh

**Как устраняется:**
1. FK `warehouse_reservations.order_id REFERENCES orders(id) ON DELETE CASCADE` — удаление order физически удаляет резервы
2. Cron-задача каждый час: переводит резервы в `released` если соответствующий order в статусе `closed` или `cancelled`
3. Инвариант I4 в Stage B: SQL-запрос находит все orphan-резервы. Если есть — это блокер migrate.

---

## D. «Project hardware ready» — буг 4+ раза

**Симптом:** «нажала "готово" — а не обновляется», «вижу старое состояние», «нужно перезагружать».

**Где живёт:** `js/order-detail.js#markProjectHardwareReady` + `_buildProjectHardwareStockTruth`. Состояние хранится в трёх местах:
- `warehouse_reservations` (status)
- `settings.projectHardwareState` (snapshot, может разойтись)
- `warehouse_history` (записи о consume)

**Commit'ы:**
- 02cb520 Make project hardware ready feedback immediate
- 7dbc848 Clarify project hardware ready action
- b04c507 Fix project hardware shortage feedback
- ecbdc1d Fix project hardware ready refresh

**Как устраняется:** Состояние хранится в **одном месте** — `warehouse_reservations.status`. Старый `settings.projectHardwareState` ключ выкидывается в Block 16. `_buildProjectHardwareStockTruth` вообще не нужен — UI читает `/api/warehouse/reservations?order_id=...&status=active` и видит правду напрямую.

---

## E. Дубликаты позиций в orders / item_data drift

**Симптом:** «у заказа в КП появилась лишняя строка», «после save позиции перемешались/задвоились».

**Где живёт:** `js/orders.js` mergeOrderRows, `js/order-detail.js` при resave.

**Commit'ы:**
- 61cf522 Deduplicate repeated order hardware rows
- ca2a910 Fix calc2 warehouse refresh and preserve order items
- 84d6df1 Preserve blank mold costs across calculator reloads
- c2511c9 Preserve warehouse hardware links on molds

**Как устраняется:**
1. `order_items` хранятся отдельно от `orders.calculator_data` JSON — никакого мерджа.
2. `PATCH /api/orders/:id` обновляет `orders` row, но НЕ трогает order_items.
3. `POST /api/orders/:id/items`, `PATCH /api/orders/:id/items/:itemId`, `DELETE` — отдельные операции, каждая идемпотентна.
4. Mold hardware ссылки — только в `mold_hardware`, никогда не в `order_items` или `calculator_data`.

---

## F. Цены/себестоимость рассинхронизированы

**Симптом:** «цена в КП не та, что на складе», «факт-данные показывают не ту себестоимость», «blank pricing разный в разных местах».

**Где живёт:** В нескольких местах хранятся копии `last_price`: warehouse_items, hw_blanks, settings JSON-структуры с blank costs, item_data в orders.

**Commit'ы:**
- b63075a Use actual warehouse NFC price in blanks
- 628a0e0 Fix blank pricing and China receipt stock
- c793060 Recover warehouse hardware pricing on order load
- 5fb5537 Preserve blank pricing on inline save
- 84d6df1 Preserve blank mold costs across calculator reloads
- 154744c Separate NFC from hardware costs
- e8dcc82 Fix warehouse-backed built-in NFC flow

**Как устраняется:** Принцип single source of truth:
- `warehouse_items.last_price` — единственная актуальная цена для warehouse-backed позиций.
- `hw_blanks.last_price` — единственная цена для бланков (заготовок).
- Калькулятор (Block 7) при пересчёте читает свежие цены из БД, не кэширует копии.
- `orders.calculator_data` ХРАНИТ снапшот цен на момент расчёта — но это снапшот, не источник. Если нужно «свежие цены» — нажми «Пересчитать», который заново читает БД.

Это решает класс «после изменения цены на складе старые КП показывают новые цифры»: они показывают **снапшот**. Хочешь свежее — пересчитай явно.

---

## G. Race conditions при параллельных приёмках/списаниях

**Симптом:** «два человека одновременно списывали — qty считается с stale read».

**Где живёт:** Любой fetch warehouse → modify in memory → save flow без БД-блокировок.

**Commit'ы:**
- 9fe2aa4 Make warehouse quantity edits cloud-safe
- 8646715 Serialize warehouse project hardware mutations

**Как устраняется:**
- Все мутации qty — через хранимую процедуру / транзакцию с `SELECT ... FOR UPDATE` на затронутых items.
- В одной транзакции: lock items → read current qty → calculate new qty → write → insert history → commit.

Реализация в `ops/api/src/routes/warehouse.js`:

```js
router.post('/items/:id/adjust', requireAuth, async (req, res) => {
  await withIdempotency(req, res, async (req, res) => {
    const delta = Number(req.body.delta);
    const note = String(req.body.note || '');
    await withTransaction(async (client) => {
      const lockRes = await client.query(`SELECT id, qty FROM warehouse_items WHERE id = $1 FOR UPDATE`, [req.params.id]);
      if (!lockRes.rows[0]) throw new Error('Not found');
      const before = Number(lockRes.rows[0].qty);
      const after = before + delta;
      if (after < 0) throw new Error('INSUFFICIENT_STOCK');
      await client.query(`UPDATE warehouse_items SET qty = $1, updated_at = NOW() WHERE id = $2`, [after, req.params.id]);
      await client.query(
        `INSERT INTO warehouse_history (item_id, type, qty_before, qty_after, qty_change, actor_user_id, note)
         VALUES ($1, 'manual_edit', $2, $3, $4, $5, $6)`,
        [req.params.id, before, after, delta, req.user.id, note]
      );
    });
    res.json({ ok: true });
  });
});
```

`SELECT FOR UPDATE` берёт row-level lock — параллельные запросы становятся в очередь.

---

## H. Стертые/потерянные фото при миграциях

**Симптом:** «у некоторых позиций склада/молдов нет фото, хотя были».

**Where живёт:** `photo_url` менялся при разных миграциях, при перепаковках, при stale кэшах.

**Commit'ы:**
- 5fd4f5f Preserve warehouse photos across browser migrations
- a781a1c Preserve white background for warehouse PNG uploads

**Как устраняется:** Storage migration в Block 10 (product-images) + Block 13 (mold-photos) — переносит фото в Selectel Object Storage, обновляет URL атомарно в БД. Документированно и тестируется ручной проверкой 5+ молдов / 5+ items.

---

## I. Авто-создание «пустых» позиций при приёмке

**Симптом:** «при создании приёмки появилась позиция склада которой не должно быть, без SKU и цены».

**Где живёт:** `js/warehouse.js#processShipmentItem` имел fallback логику «если нет warehouse_item_id — создать новую».

**Commit:** e93ca26 Block weak auto-created warehouse receipt items

**Как устраняется:** `POST /api/shipments/:id/receive` валидирует что каждый shipment_item имеет либо валидный `warehouse_item_id` (FK существует), либо явный `create_new: true` с обязательными полями `name`, `sku`, `category`. Иначе 400.

---

## J. Mold ↔ blank ссылки теряются на calc reload

**Симптом:** «у молда была привязана фурнитура, после пересчёта заказа она исчезла».

**Где живёт:** старый код хранил mold_hardware связи внутри `order_items.item_data` JSON, и калькулятор при пересчёте перезаписывал.

**Commit:** c2511c9 Preserve warehouse hardware links on molds

**Как устраняется:** Чёткая разделённость:
- `mold_hardware` (Block 5) — единственное место хранения «какая фурнитура нужна для молда»
- `order_items.item_data` — позиции конкретного заказа, не имеют права хранить mold linkage
- Калькулятор читает оба источника по ID и не перезаписывает связи

---

## K. Smoke / монитоинг не ловил эти баги

**Симптом:** Баги ловили пользователи, не CI.

**Как устраняется:**
- Инварианты I1-I7 (см. WAREHOUSE-INTERACTION-MAP) запускаются в CI на staging данных ежедневно.
- Playwright e2e smoke (Block 3-12) включает сценарии:
  - Создать заказ → списать фурнитуру → проверить qty + history + reservations
  - Принять приёмку дважды (с тем же Idempotency-Key) → qty не задвоился
  - Удалить заказ → проверить что резервы CASCADE-удалились
- UptimeRobot пингует `/api/health` каждую минуту — поверхностный мониторинг.

---

## Сводка по приоритетам

| Класс бага | Приоритет починки | Где фиксится |
|---|---|---|
| A. Cache hell | **Критично** — главная боль | Block 1 + Block 3 (полностью устраняется) |
| B. Двойное списание | **Критично** — финансовый риск | Block 3 (Idempotency) |
| C. Фантомные резервы | **Критично** — портит остатки | Block 3 + Block 9 (FK + cron) |
| D. Project hardware ready | **Критично** — это блокер для России | Block 9 (state machine на reservations) |
| E. Дубликаты в orders | **Высокий** — пересчёт ломает данные | Block 9 |
| F. Цены рассинхрон | **Высокий** — финансовые отчёты | Block 7 (snapshot semantics) |
| G. Race conditions | **Высокий** — редко, но болезненно | Block 3 (FOR UPDATE) |
| H. Потерянные фото | Средний | Block 10, Block 13 |
| I. Авто-создание позиций | Средний — портит справочник | Block 4 (валидация) |
| J. Mold ↔ blank teryyatsya | Средний | Block 5 (разделённость) |
| K. Нет мониторинга | Высокий — превентивное | Stage B (invariant checks) + Block 11 (UptimeRobot) |

---

## Чего этот документ НЕ покрывает (и почему)

Этот документ — **про склад и его прямые соседи**. Сознательно НЕ включены:
- Баги аналитики (Block 15 — переносим with known bugs, фиксим после Stage D)
- Баги UI текстов / wording / стилей — не блокеры
- Баги задач/проектов/ганта (Block 11) — есть, но не критичны, переносим как есть
- Финансовые баги — финансы выкидываются, не мигрируются

**Если по ходу миграции находим ещё классы багов** — добавляем сюда + ссылка из плана соответствующего блока.
