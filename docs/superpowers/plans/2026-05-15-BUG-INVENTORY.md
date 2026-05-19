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

---

# Расширение: баги в других модулях

> Изначально документ был только про склад. Но баги есть во всех критичных модулях. Ниже — то же самое для калькулятора, бота, заказов, фактических данных.

---

## L. Калькулятор — Draft duplicate saves

**Симптом:** «Сохранила заказ — появилось два», «при перерасчёте создалось две версии».

**Где живёт:** `js/calculator.js` функция `saveCalculatorDraft` + auto-save в `js/orders.js`.

**Commit:** 05163f4 Fix calculator draft duplicate saves

**Как устраняется:**
- Идемпотентность через `Idempotency-Key` на всех `PATCH /api/orders/:id` (Block 9).
- Auto-save в UI **выключен**: явная кнопка «Сохранить» (см. Block 9 принципы UI). Старая логика auto-save была не-идемпотентна.
- Если хочется UX-индикации «изменения не сохранены» — это локальное состояние компонента, не отправляет ничего.

---

## M. Калькулятор — Numeric coercion (строки vs числа)

**Симптом:** «1.5» × 2 = «1.51.5» (string concat вместо умножения), null/undefined в формулах ломают расчёт.

**Где живёт:** `js/calculator.js` парсинг inputs из HTML elements (`event.target.value` → строка → используется как число без `parseFloat`).

**Commit:** d531dd1 Normalize calculator numeric inputs

**Как устраняется:**
- TypeScript в `ops/api/src/calc/` — типы говорят `number`, runtime валидация на входе через схемы.
- В Vue компонентах: используется `<input type="number" v-model.number="...">` — v-model.number автоматически приводит к Number.
- На бэке: `ops/api/src/calc/index.ts` начинается с валидации всех числовых полей через helper `requireFiniteNumber(value, fieldName)`.
- Golden-master тесты ловят регрессии: если кто-то снова напишет string concat, golden-master сразу покраснеет.

---

## N. Калькулятор — Blank/pendant/B2B pricing inconsistency

**Симптом:** «Цена бланка в КП одна, в карточке другая», «B2B клиенту показывает розничную цену», «pendant base-rate выдаёт чушь».

**Где живёт:** `js/calculator.js` имеет несколько мест расчёта цены: blank, pendant, hardware, retail vs B2B — разрозненная логика, разные коэффициенты в разных местах.

**Commit'ы:**
- fc37a3a Fix blank speed propagation to calculator
- 1da79e1 Unify B2B pricing canon across calculator surfaces
- a5cd52d Fix blank pricing base-rate formula
- 154744c Separate NFC from hardware costs

**Как устраняется:**
- `ops/api/src/calc/pricing.ts` — **единственный модуль расчёта цены**. Все surface'ы (blank, pendant, hardware) дёргают из него `calculateUnitPrice(input)`.
- Чёткое разделение: `retailPrice`, `b2bPrice`, `costPrice` — три отдельные функции, не путаемся.
- Golden-master fixtures **обязательно** включают B2B-заказы (минимум 3-5 из 20).
- Тесты на pricing.ts: 50+ unit-тестов на edge case'ы (нулевая база, отрицательная маржа, мультипликаторы).

---

## O. Калькулятор — Slow startup / stale assets

**Симптом:** «Открываю calc — 30 секунд белый экран», «после деплоя показывает старую версию».

**Где живёт:** `index.html` — огромный (3595 строк), грузит десятки `<script>` тэгов в `<head>`. Не используется hash-versioning. Кэширование агрессивное.

**Commit'ы:**
- ed13a81 Auto-recover calc boot from stale assets
- 5afd73e Speed up calc login auth hydration
- 5367045 Harden calc against upstream data outages
- 1da79e1 (cache busting through query params)

**Как устраняется:**
- Vite (Block 1, Block 5) делает **content-hash-based** filenames для всего билда — `index-Ab12cD.js`. При деплое старый файл всё ещё доступен по своему хэшу, новый получает новый хэш. Никакого "stale assets".
- Один JS-бандл (≈300 KB gzipped) вместо десятков скриптов.
- TypeScript ловит type errors на этапе билда, не в runtime.
- Auth hydration: один запрос `GET /api/auth/me` при старте. Без bootstrap'ов и снапшотов.

---

## P. Бот — Restart теряет state (партиал save)

**Симптом:** «Бот перезагрузился и забыл что я писал», «отчёт за день потерялся», «timebot завис, нажала /start — всё сначала».

**Где живёт:** `bot/timebot.state.json`, `bot/timebot.pending.json`, `bot/timebot.inbox.jsonl` — файлы со state в локальной ФС процесса. При рестарте могут читаться частично, поломаться, или вообще не быть.

**Commit'ы:**
- 62aff32 Harden timebot against restarts and save failures
- 8460e8f Keep timebot reports alive until final save
- d2d1842 Fix timebot backlog recovery for freeform hour reports

**Как устраняется в Block 12:**
- **State в БД**, не на диске. Добавляется таблица `bot_conversation_state`:

```sql
-- ops/db/migrations/013_bot_state.sql
CREATE TABLE bot_conversation_state (
  chat_id       BIGINT PRIMARY KEY,
  employee_id   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  flow          TEXT,                              -- 'time_entry', 'task_create', ...
  step          TEXT,                              -- 'asking_hours', 'asking_project', ...
  draft         JSONB NOT NULL DEFAULT '{}',       -- частично собранные данные
  inbox         JSONB NOT NULL DEFAULT '[]',       -- queue входящих сообщений если бот занят
  expires_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bot_state_expires ON bot_conversation_state(expires_at);
```

- Бот при каждом message от user'а:
  1. Загружает state из БД (или создаёт пустой)
  2. Применяет логику step machine
  3. Сохраняет state обратно в БД
- Перезапуск бота → state сохранён → conversation продолжается с того же места.
- expires_at: state хранится максимум 24 часа неактивности, потом удаляется (cron).
- `inbox` JSON массив: если бот в процессе обработки сообщения и приходит новое — оно ставится в очередь.

---

## Q. Бот — Date/timezone shift

**Симптом:** «Зафиксировала часы вчера в 23:30, в timetrack видно как сегодня».

**Где живёт:** `bot/timebot.js` использует local time без явного TZ.

**Commit:** 8da2019 Repair legacy bot-shifted timetrack dates

**Как устраняется:**
- Все даты в БД хранятся как `DATE` (`time_entries.date`) или `TIMESTAMPTZ` (с явным TZ).
- Бот при создании записи: берёт TZ сотрудника (новое поле `employees.timezone` или дефолт 'Europe/Moscow'), формирует дату через `date-fns-tz` с `formatInTimeZone`.
- Тесты: пара case'ов в `bot/test/timezone.test.js` — отправить сообщение «вчера в 23:30», ожидать что запись попадёт на «вчера» в employee.timezone.

---

## R. Бот — Telegram binding ushel / inactive employee

**Симптом:** «Бот не отвечает», «через старый аккаунт сохраняются часы на чужого сотрудника».

**Где живёт:** маппинг `telegram_chat_id → employee_id` хранится в `employees.extras` JSON, без UNIQUE constraint и без timeout.

**Commit'ы:**
- 9b6416f Guard timebot saves by live telegram binding
- 4fbf889 Guard timebot against inactive employee bindings

**Как устраняется в Block 12:**
- Отдельная таблица:

```sql
CREATE TABLE bot_telegram_bindings (
  telegram_chat_id  BIGINT PRIMARY KEY,
  employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  bound_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX idx_bot_binding_employee ON bot_telegram_bindings(employee_id) WHERE is_active = TRUE;
-- Один активный binding на сотрудника. Если сотрудник биндится с нового аккаунта —
-- старый автоматически деактивируется (через trigger или прикладной код).
```

- Перед каждым save: проверка `employees.is_active = TRUE` и `bindings.is_active = TRUE`. Иначе бот шлёт «привет, твой аккаунт неактивен, обратись к админу».

---

## S. Заказы — Status not persisting / deleted order resurrection

**Симптом:** «Поменяла статус на closed, открыла снова — opens», «удалила заказ — он вернулся через 30 минут».

**Где живёт:** `js/orders.js` save flow. Старая логика: при resave заказа отправляется payload целиком, включая старые поля. Если другой клиент успел обновить статус — payload его перетирает (last-write-wins без optimistic locking). Удалённые заказы возрождались из bootstrap кэша.

**Commit'ы:**
- 499b8b5 Fix order status persistence
- 4d59cba Fix deleted order resurrection after removal
- a5b9655 Protect order items during save failures

**Как устраняется в Block 9:**
- `PATCH /api/orders/:id` принимает **только изменённые поля** (partial update), не весь объект.
- Для status есть отдельный эндпойнт `POST /api/orders/:id/status { new_status }` который атомарно меняет status (с FOR UPDATE на row).
- DELETE order физически удаляет row + CASCADE на reservations/order_items/factual. Никаких "soft delete" + "bootstrap repopulate".
- `If-Match` header с ETag (текущий updated_at) — если кто-то обновил между read и write → 412 Precondition Failed.

---

## T. Заказы — Clone bug + warehouse reservation copy

**Симптом:** «Склонировала заказ, у клона все позиции дублируются», «у клона висят чужие резервы».

**Где живёт:** `js/orders.js` функция `cloneOrder` — копирует поля + items, но также копирует reservation references.

**Commit:** f01acc5 Fix order cloning and warehouse reservation stock handling

**Как устраняется:**
- `POST /api/orders/:id/clone` — создаёт **новый** order с status='draft', копирует только order_items (с новыми ID), **не копирует** reservations (новые создадутся при сохранении нового заказа).
- На уровне БД: clone — это `INSERT` с новыми ID + дублирование order_items, без копирования reservations.
- Тест: clone заказа с активными reservations → у клона 0 reservations.

---

## U. Заказы — Margin calculation drift after save

**Симптом:** «Открыла КП — margin 23%, нажала сохранить — стал 21%, ничего не меняла».

**Где живёт:** `js/calculator.js` recalc срабатывает в нескольких точках с разными inputs. После save resave включает свежие цены — числа меняются.

**Commit:** e81110b Fix order margins and save errors

**Как устраняется:**
- Принцип «calculator_data — snapshot, не live ссылки» (см. BUG класс F).
- `PATCH /api/orders/:id` НЕ пересчитывает автоматически. Только `POST /api/orders/:id/recalc` явно пересчитывает.
- UI: после изменения позиций — кнопка «Пересчитать» подсвечивается (UI знает «состав изменился, цифры могут быть неактуальны»). Юзер нажимает явно.
- Принцип: **только пользователь решает когда применять новые цены**. Никаких авто-recalc.

---

## V. Factual — Period filtering / aggregation

**Симптом:** «Отчёт за май показывает данные за апрель», «итог по месяцу не совпадает с суммой деталей».

**Где живёт:** `js/factual.js` фильтрация дат на клиенте, агрегация в нескольких местах с разными правилами.

**Commit'ы:**
- 79901f8 Fix factual period filtering
- 49dc688 Fix factual import aggregation
- 9c6944b Expose plan/fact hour drivers in factual view

**Как устраняется в Block 9 (factual часть):**
- Фильтрация дат — на БД через SQL `WHERE date BETWEEN $1 AND $2`. Не на клиенте.
- Агрегация — одна SQL-функция, один источник правды:

```sql
CREATE OR REPLACE FUNCTION factual_period_summary(year_from INT, month_from INT, year_to INT, month_to INT)
RETURNS TABLE (period TEXT, revenue NUMERIC, cost NUMERIC, margin NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(of.created_at, 'YYYY-MM') AS period,
    SUM(of.actual_revenue),
    SUM(of.actual_cost),
    SUM(of.actual_margin)
  FROM order_factuals of
  WHERE of.created_at BETWEEN make_date(year_from, month_from, 1)
                          AND (make_date(year_to, month_to, 1) + INTERVAL '1 month - 1 day')
  GROUP BY to_char(of.created_at, 'YYYY-MM')
  ORDER BY period;
END;
$$ LANGUAGE plpgsql;
```

- Юзер на UI выбирает период. API вызывает функцию с этими параметрами. UI отображает результат как есть. Никаких пост-фильтраций.

---

## W. Factual — Blank/mold cost basis drift

**Симптом:** «Factual показывает себестоимость не ту, что в КП», «через месяц после закрытия пересчитывает заново с новыми ценами».

**Где живёт:** `js/factual.js` при отображении пересчитывает себестоимость по текущим ценам warehouse_items/hw_blanks.

**Commit'ы:**
- a994670 Fix blank mold costs in calculator and factual
- 4326a58 Fix factual auto restore and legacy hardware cost basis
- 5539263 Fix factual stage allocation and tax rows

**Как устраняется:**
- `order_factuals.factual_data` JSON хранит **снапшот** себестоимости на момент закрытия. Не пересчитывается при отображении.
- Если хочется «обновить факт с новыми ценами» — отдельная кнопка `POST /api/orders/:id/factual/recalc`. Юзер сам решает.
- Принцип идентичен U: snapshot semantics — закрытый период иммутабелен, если только не пересчитан явно.

---

## X. Production plan — Drag reorder / status not saved

**Симптом:** «Перетащила задачу в плане производства — порядок сбросился после reload».

**Где живёт:** `js/production_plan.js` drag-reorder без сохранения. Auto-save был добавлен, но иногда failed silently.

**Commit:** 4e2512e Add drag reorder to production queue

**Как устраняется в Block 8:**
- При drag-end → `POST /api/production/plan/reorder { entry_id, new_position }` — атомарно меняет position у затронутых записей.
- Position типа INTEGER, шагом 100 (100, 200, 300...). При drag вставка между — даём 150. Если несколько вставок забиваются — периодическая renumber через background job.
- Failed save → UI откатывает порядок + красная плашка.

---

## Y. Multiple — Save partial / save failures

**Симптом:** «Нажала сохранить — половина сохранилась, половина нет, нет понимания что осталось».

**Где живёт:** везде где старый код делает несколько Supabase-вызовов подряд без транзакции (orders save → items save → reservations save — три отдельных запроса, может сломаться посередине).

**Commit'ы (фрагмент):**
- a5b9655 Protect order items during save failures
- 62aff32 Harden timebot against restarts and save failures
- 824101c Fix warehouse receipt stock picker (race)

**Как устраняется системно:**
- **Всё мутирующее API — в одной транзакции** (`withTransaction`). Либо всё сохранилось, либо ничего не сохранилось.
- При ошибке: 500 с подробной error.code, UI показывает «не удалось, попробуй ещё раз». Никаких «половина прошла».
- Idempotency-Key защищает повтор от двойного применения если первый запрос прошёл (но клиент не получил ответ).

---

# Сводка по приоритетам (полная)

| # | Класс бага | Модуль | Приоритет | Где фиксится |
|---|---|---|---|---|
| A | Cache hell | Все | **Критично** | Block 1+3 (полностью устраняется арх-сменой) |
| B | Двойное списание | Warehouse, Orders | **Критично** | Block 3 (Idempotency) |
| C | Фантомные резервы | Warehouse | **Критично** | Block 3+9 (FK+cron) |
| D | Project hardware ready | Warehouse, Orders | **Критично** | Block 9 (state machine) |
| E | Дубликаты в orders | Orders | Высокий | Block 9 |
| F | Цены рассинхрон | Calc, Orders, Factual | Высокий | Block 7+9 (snapshot semantics) |
| G | Race conditions | Warehouse, Bot, Orders | Высокий | Block 3+9+12 (FOR UPDATE) |
| H | Потерянные фото | Storage | Средний | Block 10, 13 |
| I | Авто-создание warehouse items | Shipments | Средний | Block 4 (валидация) |
| J | Mold ↔ blank links lost | Molds, Calc | Средний | Block 5 (разделённость) |
| K | Нет мониторинга | Все | Высокий | Stage B + Block 11 |
| **L** | Calc draft duplicate saves | Calc, Orders | **Критично** | Block 9 (idempotency + no auto-save) |
| **M** | Numeric coercion | Calc | Высокий | Block 7 (TypeScript) |
| **N** | Pricing inconsistency | Calc | **Критично** | Block 7 (единый pricing.ts) |
| **O** | Slow startup, stale assets | UI | Высокий | Block 1+5 (Vite hash-naming) |
| **P** | Bot restart loses state | Bot | **Критично** | Block 12 (state в БД) |
| **Q** | Bot timezone shift | Bot | Высокий | Block 12 (UTC + employee TZ) |
| **R** | Bot telegram binding mess | Bot | Высокий | Block 12 (отдельная таблица) |
| **S** | Order status / resurrection | Orders | **Критично** | Block 9 (partial PATCH + DELETE CASCADE + If-Match) |
| **T** | Order clone bug | Orders | Высокий | Block 9 (явный clone эндпойнт) |
| **U** | Margin drift on save | Orders, Calc | **Критично** | Block 9 (no auto-recalc) |
| **V** | Factual period/aggregation | Factual | Высокий | Block 9 (SQL aggregation function) |
| **W** | Factual cost basis drift | Factual | Высокий | Block 9 (snapshot semantics) |
| **X** | Production drag reorder | Production | Средний | Block 8 (position field + atomic API) |
| **Y** | Save partial | Все | **Критично** | Глобальный принцип `withTransaction` |

**Итого 25 классов багов**, систематически устраняемых архитектурой миграции. Это не означает что после миграции багов 0 — это означает что **классы багов** (а не отдельные баги) перестают быть проблемой.

**Если по ходу миграции находим ещё классы багов** — добавляем сюда + ссылка из плана соответствующего блока.
